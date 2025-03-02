import React, { useState, useEffect, useMemo } from "react";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import SwaggerClient from "swagger-client";
import YAML from "yaml";
import { Canvas, Node, Edge, NodeProps, EdgeProps } from "reaflow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Download, Upload, ZoomIn, ZoomOut, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/ui/navbar";

const LOCAL_STORAGE_KEY = "spec_view_saved_specs";

// Strongly typed node and edge shapes with additional metadata
interface MyNode {
    id: string;
    text: string;
    type?: "endpoint" | "request" | "response" | "schema" | "property" | "array";
    data?: {
        description?: string;
        required?: boolean;
        format?: string;
        example?: unknown;
        method?: string;
        path?: string;
    };
}

interface MyEdge {
    id: string;
    from: string;
    to: string;
    text?: string;
}

interface SpecDocument {
    id: string;
    name: string;
    content: string;
    lastModified: number;
}

// Node type styles and colors
const NODE_STYLES = {
    endpoint: { fill: "#4f46e5", color: "white", radius: 6 },
    request: { fill: "#7c3aed", color: "white", radius: 4 },
    response: { fill: "#16a34a", color: "white", radius: 4 },
    schema: { fill: "#0369a1", color: "white", radius: 4 },
    property: { fill: "#f59e0b", color: "black", radius: 2 },
    array: { fill: "#ef4444", color: "white", radius: 4 },
    default: { fill: "#6b7280", color: "white", radius: 4 },
};

/**
 * Safely generates a node ID.
 */
const generateNodeId = (parentId?: string, key?: string): string => {
    const safeParent = parentId && parentId.trim() ? parentId : "root";
    if (!key || !key.trim()) {
        return `${safeParent}-unknown-${Math.random().toString(36).substring(7)}`;
    }
    return `${safeParent}-${key.replace(/[\s./{}:]+/g, "_")}`;
};

/**
 * Recursively extracts nodes and edges from schemas.
 */
const extractSchemaNodes = (
    schema: any,
    parentId: string,
    nodes: MyNode[],
    edges: MyEdge[],
    nodeName: string = "Schema",
    nodeType: "schema" | "property" | "array" = "schema"
) => {
    if (!schema || typeof schema !== "object") return;

    // Create schema node with more metadata
    const nodeId = generateNodeId(parentId, nodeName);
    const schemaData = {
        description: schema.description,
        required: schema.required === true,
        format: schema.format,
        example: schema.example,
    };

    nodes.push({
        id: nodeId,
        text: nodeName,
        type: nodeType,
        data: schemaData
    });

    // Connect to parent
    edges.push({
        id: `${parentId}-to-${nodeId}`,
        from: parentId,
        to: nodeId,
        text: nodeType === "array" ? "items" : undefined
    });

    // Process object properties
    if (schema.type === "object" && schema.properties) {
        // Add required fields notation
        const requiredProps = schema.required || [];

        Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
            const propNodeId = generateNodeId(nodeId, propName);
            const isRequired = requiredProps.includes(propName);
            const propType = propSchema.type || "object";
            const displayName = `${propName}${isRequired ? '*' : ''}: ${propType}`;

            nodes.push({
                id: propNodeId,
                text: displayName,
                type: "property",
                data: {
                    description: propSchema.description,
                    required: isRequired,
                    format: propSchema.format,
                    example: propSchema.example
                }
            });

            edges.push({
                id: `${nodeId}-to-${propNodeId}`,
                from: nodeId,
                to: propNodeId
            });

            // Recursively process nested schemas
            if (propSchema.type === "object" && propSchema.properties) {
                extractSchemaNodes(propSchema, propNodeId, nodes, edges, "Object", "schema");
            } else if (propSchema.type === "array" && propSchema.items) {
                extractSchemaNodes(propSchema.items, propNodeId, nodes, edges, "Array Items", "array");
            } else if (propSchema.$ref) {
                // Handle schema references - would be expanded in a complete implementation
                nodes.push({
                    id: `${propNodeId}-ref`,
                    text: `Ref: ${propSchema.$ref.split('/').pop()}`,
                    type: "schema"
                });
                edges.push({
                    id: `${propNodeId}-to-ref`,
                    from: propNodeId,
                    to: `${propNodeId}-ref`
                });
            }
        });
    } else if (schema.type === "array" && schema.items) {
        extractSchemaNodes(schema.items, nodeId, nodes, edges, "Array Items", "array");
    } else if (schema.$ref) {
        // Handle schema references
        nodes.push({
            id: `${nodeId}-ref`,
            text: `Ref: ${schema.$ref.split('/').pop()}`,
            type: "schema"
        });
        edges.push({
            id: `${nodeId}-to-ref`,
            from: nodeId,
            to: `${nodeId}-ref`
        });
    }
};

/**
 * Extracts nodes and edges from OpenAPI paths.
 */
const extractNodesAndEdges = (spec: any): { nodes: MyNode[]; edges: MyEdge[] } => {
    const nodes: MyNode[] = [];
    const edges: MyEdge[] = [];

    if (!spec || !spec.paths) {
        console.warn("No paths found in spec", spec);
        return { nodes, edges };
    }

    // Create root API node
    const rootNodeId = "root";
    nodes.push({
        id: rootNodeId,
        text: spec.info?.title || "API",
        type: "endpoint",
        data: {
            description: spec.info?.description
        }
    });

    // Process each path and method
    Object.entries(spec.paths).forEach(([path, methods]: [string, any]) => {
        Object.entries(methods).forEach(([method, details]: [string, any]) => {
            if (["get", "post", "put", "delete", "patch"].includes(method)) {
                const endpointId = generateNodeId(rootNodeId, `${method}_${path}`);
                const displayName = `${method.toUpperCase()} ${path}`;

                nodes.push({
                    id: endpointId,
                    text: displayName,
                    type: "endpoint",
                    data: {
                        description: details.summary || details.description,
                        method: method.toUpperCase(),
                        path: path
                    }
                });

                edges.push({
                    id: `root-to-${endpointId}`,
                    from: rootNodeId,
                    to: endpointId
                });

                // Process request bodies
                const requestSchema = details.requestBody?.content?.["application/json"]?.schema;
                if (requestSchema) {
                    const requestNodeId = generateNodeId(endpointId, "request");
                    nodes.push({
                        id: requestNodeId,
                        text: "Request Body",
                        type: "request"
                    });

                    edges.push({
                        id: `${endpointId}-to-${requestNodeId}`,
                        from: endpointId,
                        to: requestNodeId
                    });

                    extractSchemaNodes(requestSchema, requestNodeId, nodes, edges);
                }

                // Process responses
                if (details.responses) {
                    Object.entries(details.responses).forEach(([status, response]: [string, any]) => {
                        const responseSchema = response?.content?.["application/json"]?.schema;
                        if (responseSchema) {
                            const responseNodeId = generateNodeId(endpointId, `response_${status}`);
                            nodes.push({
                                id: responseNodeId,
                                text: `${status} Response`,
                                type: "response",
                                data: {
                                    description: response.description
                                }
                            });

                            edges.push({
                                id: `${endpointId}-to-${responseNodeId}`,
                                from: endpointId,
                                to: responseNodeId
                            });

                            extractSchemaNodes(responseSchema, responseNodeId, nodes, edges);
                        }
                    });
                }

                // Process parameters
                if (details.parameters && details.parameters.length > 0) {
                    const paramsNodeId = generateNodeId(endpointId, "parameters");
                    nodes.push({
                        id: paramsNodeId,
                        text: "Parameters",
                        type: "schema"
                    });

                    edges.push({
                        id: `${endpointId}-to-${paramsNodeId}`,
                        from: endpointId,
                        to: paramsNodeId
                    });

                    details.parameters.forEach((param: any) => {
                        const paramNodeId = generateNodeId(paramsNodeId, `${param.name}_${param.in}`);
                        nodes.push({
                            id: paramNodeId,
                            text: `${param.name} (${param.in})${param.required ? '*' : ''}`,
                            type: "property",
                            data: {
                                description: param.description,
                                required: param.required
                            }
                        });

                        edges.push({
                            id: `${paramsNodeId}-to-${paramNodeId}`,
                            from: paramsNodeId,
                            to: paramNodeId
                        });

                        if (param.schema) {
                            extractSchemaNodes(param.schema, paramNodeId, nodes, edges, "Schema", "schema");
                        }
                    });
                }
            }
        });
    });

    return { nodes, edges };
};

/**
 * Parses an OpenAPI spec and returns nodes and edges.
 */
const parseOpenAPISpec = async (yamlContent: string) => {
    try {
        const parsedSpec = typeof yamlContent === "string" ? YAML.parse(yamlContent) : yamlContent;
        const client = await SwaggerClient({ spec: parsedSpec });
        return extractNodesAndEdges(client.spec);
    } catch (error) {
        console.error("Error parsing OpenAPI spec", error);
        return { nodes: [], edges: [] };
    }
};

// Custom node renderer component - Enhanced for interaction
const CustomNode = (props: NodeProps) => {
    // If props is null or undefined, render nothing
    if (!props) {
        return null;
    }
    
    try {
        // Use safe optional chaining for all property accesses
        const node = props.node;
        if (!node) {
            // Return a minimal node if node is missing
            return <Node {...props} style={{ fill: "#6b7280", color: "white" }} />;
        }
        
        // Get node data safely with fallbacks
        const nodeData = node.properties?.data || {};
        
        // Get node type with fallback
        const nodeType = (nodeData.type as keyof typeof NODE_STYLES) || "default";
        
        // Get style with fallback
        const style = NODE_STYLES[nodeType] || NODE_STYLES.default;
        
        // Check if node is selected
        const isSelected = props.isSelected || false;
        
        // Safely return the node with all properties
        return (
            <Node
                {...props}
                dragType="port"
                dragHandle=".node-drag-handle"
                style={{
                    fill: style.fill || "#6b7280",
                    color: style.color || "white",
                    stroke: isSelected ? "#3b82f6" : nodeData.data?.required ? "#ef4444" : undefined,
                    strokeWidth: isSelected ? 3 : nodeData.data?.required ? 2 : 0,
                    rx: style.radius || 4,
                    ry: style.radius || 4,
                    cursor: "pointer"
                }}
            >
                <foreignObject
                    className="node-drag-handle"
                    width={props.width}
                    height={props.height}
                    x={0}
                    y={0}
                    style={{ pointerEvents: "none" }}
                >
                    <div 
                        style={{ 
                            width: "100%", 
                            height: "100%", 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center",
                            padding: "4px", 
                            overflow: "hidden",
                            color: style.color || "white",
                            fontSize: "12px",
                            fontWeight: isSelected ? "bold" : "normal",
                            textAlign: "center"
                        }}
                    >
                        {node.text}
                    </div>
                </foreignObject>
            </Node>
        );
    } catch (error) {
        // In case of any error, return a fallback node
        console.error("Error rendering node:", error);
        return <Node {...props} style={{ fill: "#6b7280", color: "white" }} />;
    }
};

// Custom edge renderer with enhanced styling
const CustomEdge = (props: EdgeProps) => {
    try {
        const isSelected = props.isSelected || false;
        
        return (
            <Edge
                {...props}
                style={{
                    stroke: isSelected ? "#3b82f6" : "#64748b",
                    strokeWidth: isSelected ? 2 : 1.5,
                    opacity: isSelected ? 1 : 0.8,
                }}
                arrow={true}
                arrowSize={6}
                pathOptions={{
                    smooth: true,
                    curveness: 0.2,
                }}
            />
        );
    } catch (error) {
        console.error("Error rendering edge:", error);
        return <Edge {...props} />;
    }
};

const ViewerPage: React.FC = () => {
    const [specs, setSpecs] = useState<SpecDocument[]>([]);
    const [currentSpec, setCurrentSpec] = useState<SpecDocument | null>(null);
    const [parsedData, setParsedData] = useState<{ nodes: MyNode[]; edges: MyEdge[] }>({
        nodes: [],
        edges: [],
    });
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState<number>(1);
    const [selectedNode, setSelectedNode] = useState<MyNode | null>(null);
    const [selectedEdge, setSelectedEdge] = useState<MyEdge | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [importText, setImportText] = useState<string>("");
    const [newSpecName, setNewSpecName] = useState<string>("");
    const [showControls, setShowControls] = useState<boolean>(true);

    // Filter nodes based on search term
    const filteredNodes = useMemo(() => {
        if (!searchTerm.trim()) return parsedData.nodes;

        return parsedData.nodes.filter(node =>
            node.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
            node.data?.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            node.data?.path?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [parsedData.nodes, searchTerm]);

    // Find connected edges for the filtered nodes
    const filteredEdges = useMemo(() => {
        if (!searchTerm.trim()) return parsedData.edges;

        const nodeIds = new Set(filteredNodes.map(n => n.id));
        return parsedData.edges.filter(edge =>
            nodeIds.has(edge.from) && nodeIds.has(edge.to)
        );
    }, [filteredNodes, parsedData.edges, searchTerm]);

    // Load saved specs from localStorage
    useEffect(() => {
        const savedSpecs = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedSpecs) {
            try {
                setSpecs(JSON.parse(savedSpecs));
            } catch (error) {
                console.error("Error loading saved specs", error);
                setSpecs([]);
            }
        }
    }, []);

    const loadSpec = async (spec: SpecDocument) => {
        setLoading(true);
        setError(null);
        setCurrentSpec(spec);
        setSelectedNode(null);
        setSearchTerm("");

        try {
            const parsed = await parseOpenAPISpec(spec.content);
            setParsedData(parsed);
        } catch (error) {
            console.error("Error loading spec", error);
            setError("Failed to load spec. The spec may be invalid or contain errors.");
            setParsedData({ nodes: [], edges: [] });
        } finally {
            setLoading(false);
        }
    };

    const deleteSpec = (id: string) => {
        const newSpecs = specs.filter(spec => spec.id !== id);
        setSpecs(newSpecs);
        if (currentSpec?.id === id) {
            setCurrentSpec(null);
            setParsedData({ nodes: [], edges: [] });
        }
    };

    const importSpec = async () => {
        if (!importText.trim() || !newSpecName.trim()) return;

        try {
            setLoading(true);
            // Validate that the YAML/JSON is parseable
            const parsedContent = YAML.parse(importText);

            const newSpec: SpecDocument = {
                id: `spec-${Date.now()}`,
                name: newSpecName,
                content: importText,
                lastModified: Date.now()
            };

            const newSpecs = [...specs, newSpec];
            setSpecs(newSpecs);
            setImportText("");
            setNewSpecName("");
            loadSpec(newSpec);
        } catch (error) {
            setError("Failed to import spec. Please check that the YAML/JSON is valid.");
        } finally {
            setLoading(false);
        }
    };

    const exportSpec = () => {
        if (!currentSpec) return;

        const blob = new Blob([currentSpec.content], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentSpec.name}.yaml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <Navbar />
            <SidebarProvider>
                <div className="flex h-screen w-full overflow-hidden bg-gray-950 text-gray-100">
                    <Sidebar className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h2 className="text-lg font-semibold">OpenAPI Specs</h2>
                            <Button variant="ghost" size="sm">
                                <Plus size={16} className="mr-1" /> New
                            </Button>
                        </div>

                        <div className="p-3">
                            <Input
                                placeholder="Search specs..."
                                className="bg-gray-800 border-gray-700"
                            />
                        </div>

                        <div className="flex-1 overflow-auto">
                            {specs.length > 0 ? (
                                <ul className="p-2">
                                    {specs.map((specObj) => (
                                        <li
                                            key={specObj.id}
                                            className={`mb-2 p-3 rounded-md cursor-pointer transition-colors ${currentSpec?.id === specObj.id
                                                ? "bg-blue-900 text-white"
                                                : "hover:bg-gray-800"
                                                }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div onClick={() => loadSpec(specObj)}>
                                                    <div className="font-medium">{specObj.name}</div>
                                                    <div className="text-xs text-gray-400">
                                                        {new Date(specObj.lastModified).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteSpec(specObj.id);
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="p-4 text-gray-400 text-center">No saved specs</p>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-800">
                            <Tabs defaultValue="import">
                                <TabsList className="grid grid-cols-2 mb-2">
                                    <TabsTrigger value="import">Import</TabsTrigger>
                                    <TabsTrigger value="export" disabled={!currentSpec}>Export</TabsTrigger>
                                </TabsList>

                                <TabsContent value="import">
                                    <div className="space-y-2">
                                        <Input
                                            placeholder="Spec Name"
                                            value={newSpecName}
                                            onChange={(e) => setNewSpecName(e.target.value)}
                                            className="bg-gray-800 border-gray-700"
                                        />
                                        <textarea
                                            placeholder="Paste YAML or JSON..."
                                            value={importText}
                                            onChange={(e) => setImportText(e.target.value)}
                                            className="w-full h-24 p-2 text-sm bg-gray-800 border border-gray-700 rounded-md"
                                        />
                                        <Button
                                            onClick={importSpec}
                                            disabled={!importText.trim() || !newSpecName.trim() || loading}
                                            className="w-full"
                                        >
                                            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                            Import
                                        </Button>
                                    </div>
                                </TabsContent>

                                <TabsContent value="export">
                                    <Button onClick={exportSpec} className="w-full">
                                        <Download className="w-4 h-4 mr-2" />
                                        Export YAML
                                    </Button>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </Sidebar>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        {currentSpec ? (
                            <>
                                <div className="border-b border-gray-800 p-4 flex justify-between items-center">
                                    <div>
                                        <h1 className="text-xl font-semibold">{currentSpec.name}</h1>
                                        <p className="text-sm text-gray-400">
                                            {parsedData.nodes.length} nodes • {parsedData.edges.length} edges
                                        </p>
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <Input
                                            placeholder="Search nodes..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-60 bg-gray-800 border-gray-700"
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                                        >
                                            <ZoomOut size={16} />
                                        </Button>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                                        >
                                            <ZoomIn size={16} />
                                        </Button>
                                        
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowControls(!showControls)}
                                        >
                                            {showControls ? "Hide Controls" : "Show Controls"}
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex flex-1 overflow-hidden">
                                    <div className="flex-1 overflow-hidden bg-gray-950 relative">
                                        {loading ? (
                                            <div className="flex items-center justify-center h-full">
                                                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                            </div>
                                        ) : error ? (
                                            <div className="flex items-center justify-center h-full">
                                                <p className="text-red-500">{error}</p>
                                            </div>
                                        ) : (
                                            <>
                                                <Canvas
                                                    nodes={filteredNodes}
                                                    edges={filteredEdges}
                                                    fit={true}
                                                    zoom={zoom}
                                                    maxZoom={2}
                                                    minZoom={0.3}
                                                    direction="DOWN"
                                                    node={CustomNode}
                                                    edge={CustomEdge}
                                                    selections={selectedNode ? [selectedNode.id] : []}
                                                    animated={true}
                                                    pannable={true}
                                                    zoomable={true}
                                                    readonly={false}
                                                    dragEdge={true}
                                                    dragNode={true}
                                                    placeholderNodeWidth={150}
                                                    placeholderNodeHeight={50}
                                                    className="w-full h-full"
                                                    onNodeClick={(event, node) => {
                                                        try {
                                                            if (node && node.id) {
                                                                // Extract the full node data from our original nodes array
                                                                const nodeId = node.id;
                                                                const fullNodeData = parsedData.nodes.find(n => n.id === nodeId);
                                                                if (fullNodeData) {
                                                                    setSelectedNode(fullNodeData);
                                                                } else if (node.properties && node.properties.data) {
                                                                    setSelectedNode(node.properties.data as MyNode);
                                                                }
                                                            }
                                                        } catch (error) {
                                                            console.error("Error handling node click:", error);
                                                        }
                                                    }}
                                                    onEdgeClick={(event, edge) => {
                                                        try {
                                                            if (edge && edge.id) {
                                                                const edgeId = edge.id;
                                                                const fullEdgeData = parsedData.edges.find(e => e.id === edgeId);
                                                                if (fullEdgeData) {
                                                                    setSelectedEdge(fullEdgeData);
                                                                }
                                                            }
                                                        } catch (error) {
                                                            console.error("Error handling edge click:", error);
                                                        }
                                                    }}
                                                    onCanvasClick={() => {
                                                        // Deselect when clicking on empty canvas
                                                        setSelectedNode(null);
                                                        setSelectedEdge(null);
                                                    }}
                                                />
                                                
                                                {/* Additional canvas controls */}
                                                {showControls && (
                                                    <div className="absolute bottom-4 right-4 bg-gray-800 p-3 rounded-lg shadow-lg opacity-80 hover:opacity-100 transition-opacity">
                                                        <div className="flex flex-col space-y-2">
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm"
                                                                onClick={() => setZoom(1)}
                                                                className="w-full"
                                                            >
                                                                Reset Zoom
                                                            </Button>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm"
                                                                onClick={() => {
                                                                    // Reset selected node
                                                                    setSelectedNode(null);
                                                                    setSelectedEdge(null);
                                                                }}
                                                                className="w-full"
                                                            >
                                                                Clear Selection
                                                            </Button>
                                                            <p className="text-xs text-gray-400 mt-2 text-center">
                                                                Drag nodes to reposition • Click to select
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {selectedNode && (
                                        <div className="w-80 border-l border-gray-800 p-4 overflow-y-auto bg-gray-900">
                                            <Card className="bg-gray-800 border-gray-700">
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-lg">{selectedNode.text}</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <dl className="space-y-2 text-sm">
                                                        {selectedNode.type && (
                                                            <div>
                                                                <dt className="text-gray-400">Type</dt>
                                                                <dd className="font-medium capitalize">{selectedNode.type}</dd>
                                                            </div>
                                                        )}

                                                        {selectedNode.data?.description && (
                                                            <div>
                                                                <dt className="text-gray-400">Description</dt>
                                                                <dd>{selectedNode.data.description}</dd>
                                                            </div>
                                                        )}

                                                        {selectedNode.data?.method && selectedNode.data?.path && (
                                                            <div>
                                                                <dt className="text-gray-400">Endpoint</dt>
                                                                <dd>
                                                                    <span className="px-2 py-1 rounded bg-blue-900 text-white text-xs mr-2">
                                                                        {selectedNode.data.method}
                                                                    </span>
                                                                    <code className="text-green-400">{selectedNode.data.path}</code>
                                                                </dd>
                                                            </div>
                                                        )}

                                                        {selectedNode.data?.required !== undefined && (
                                                            <div>
                                                                <dt className="text-gray-400">Required</dt>
                                                                <dd>{selectedNode.data.required ? "Yes" : "No"}</dd>
                                                            </div>
                                                        )}

                                                        {selectedNode.data?.format && (
                                                            <div>
                                                                <dt className="text-gray-400">Format</dt>
                                                                <dd>{selectedNode.data.format}</dd>
                                                            </div>
                                                        )}

                                                        {selectedNode.data?.example !== undefined && (
                                                            <div>
                                                                <dt className="text-gray-400">Example</dt>
                                                                <dd className="font-mono text-xs bg-gray-950 p-2 rounded overflow-x-auto">
                                                                    {typeof selectedNode.data.example === 'object'
                                                                        ? JSON.stringify(selectedNode.data.example, null, 2)
                                                                        : String(selectedNode.data.example)
                                                                    }
                                                                </dd>
                                                            </div>
                                                        )}
                                                    </dl>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <h2 className="text-2xl font-semibold mb-2">No Spec Selected</h2>
                                <p className="text-gray-400 mb-8 max-w-md">
                                    Select a spec from the sidebar or import a new OpenAPI specification to visualize your API structure.
                                </p>

                                {specs.length === 0 && (
                                    <Card className="w-96 bg-gray-800 border-gray-700">
                                        <CardHeader>
                                            <CardTitle>Get Started</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm mb-4">
                                                Import your first OpenAPI specification to begin exploring your API structure.
                                            </p>
                                            <Input
                                                placeholder="Spec Name"
                                                value={newSpecName}
                                                onChange={(e) => setNewSpecName(e.target.value)}
                                                className="mb-2 bg-gray-900 border-gray-700"
                                            />
                                            <textarea
                                                placeholder="Paste YAML or JSON..."
                                                value={importText}
                                                onChange={(e) => setImportText(e.target.value)}
                                                className="w-full h-24 p-2 text-sm bg-gray-900 border border-gray-700 rounded-md mb-2"
                                            />
                                            <Button
                                                onClick={importSpec}
                                                disabled={!importText.trim() || !newSpecName.trim() || loading}
                                                className="w-full"
                                            >
                                                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                                Import Spec
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </SidebarProvider>
        </>
    );
};

export default ViewerPage;