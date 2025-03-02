import React, { useRef, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Move, RefreshCw } from 'lucide-react';
import { Navbar } from '@/components/ui/navbar';

// Import our custom hooks
import {
    ApiSpec,
    useLocalStorageSpecs,
    useSpecParser,
    useGraphVisualization,
    useViewState,
    getMethodColor,
    getStatusColor
} from '@/hooks/useOpenAPIParser';

// Constants
const LOCAL_STORAGE_KEY = "spec_view_saved_specs";

// Node spacing constants
const NODE_HORIZONTAL_SPACING = 250; // Increased horizontal spacing
const NODE_VERTICAL_SPACING = 180; // Increased vertical spacing
const RESPONSE_HORIZONTAL_OFFSET = 0; // Responses align horizontally with their parent
const RESPONSE_VERTICAL_SPACING = 100; // Space between responses

// Add a utility function to help debug node IDs when needed
const debugNodeId = (id) => {
    console.log('Node ID:', id);
    const parts = id.split('-');
    console.log('Parts:', parts);
    if (parts[0] === 'response') {
        const endpointId = parts.slice(1, -1).join('-');
        console.log('Derived endpoint ID:', `endpoint-${endpointId}`);
    }
    return id;
};

const OpenAPIViewer: React.FC = () => {
    // Load specs from localStorage
    const { specs, isLoading: specsLoading } = useLocalStorageSpecs(LOCAL_STORAGE_KEY);

    // State for selected spec
    const [selectedSpec, setSelectedSpec] = useState<ApiSpec | null>(null);

    // State for keeping track of the expanded endpoints to preserve this information
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    // Parse the selected spec into endpoints
    const { endpoints, isLoading: parsingLoading, error: parsingError } = useSpecParser(selectedSpec);

    // Custom hook modification to pass expanded nodes state
    const { nodes, edges, toggleNodeExpansion } = useGraphVisualization(
        endpoints,
        selectedSpec?.name || '',
        selectedSpec?.version || '',
        expandedNodes,
        NODE_HORIZONTAL_SPACING,
        NODE_VERTICAL_SPACING,
        RESPONSE_HORIZONTAL_OFFSET,
        RESPONSE_VERTICAL_SPACING
    );

    // Loading state
    const isLoading = specsLoading || parsingLoading;

    // View state management (zoom, pan)
    const viewContainerRef = useRef<HTMLDivElement>(null);
    const {
        viewState,
        setViewState,
        isDragging,
        setIsDragging,
        dragStartPositionRef,
        nodeDragRef,
        handleZoom,
        resetView
    } = useViewState();

    // Set the first spec as selected when specs are loaded
    useEffect(() => {
        if (specs.length > 0 && !selectedSpec) {
            setSelectedSpec(specs[0]);
        }
    }, [specs, selectedSpec]);

    // Handle API spec selection
    const handleSelectSpec = (spec: ApiSpec) => {
        setSelectedSpec(spec);
        setExpandedNodes(new Set()); // Reset expanded nodes when changing specs
        resetView(); // Reset view when changing specs
    };

    // Custom toggle node expansion function that updates our expandedNodes state
    const handleToggleNodeExpansion = (nodeId: string) => {
        // Log for debugging
        console.log('Toggling node:', nodeId);

        // Update graph visualization
        toggleNodeExpansion(nodeId);

        // Update our expanded nodes set
        setExpandedNodes(prevExpanded => {
            const newExpanded = new Set(prevExpanded);

            // Check if we're expanding or collapsing
            if (newExpanded.has(nodeId)) {
                console.log('Collapsing node:', nodeId);
                newExpanded.delete(nodeId);
            } else {
                console.log('Expanding node:', nodeId);
                newExpanded.add(nodeId);

                // If expanding, we can add an animation effect by slightly 
                // repositioning the response nodes with a timeout
                if (viewContainerRef.current) {
                    // Find all response nodes for this endpoint
                    const endpointPrefix = nodeId.replace('endpoint-', '');
                    const responsePrefix = `response-${endpointPrefix}`;

                    // Apply slight random offset animation to responses
                    setTimeout(() => {
                        nodes.forEach((node, idx) => {
                            if (node.id.startsWith(responsePrefix)) {
                                // Animate nodes with slight delay between each
                                const nodeEl = viewContainerRef.current.querySelector(`[data-node-id="${node.id}"]`);
                                if (nodeEl) {
                                    nodeEl.style.transform = 'translate(-50%, -50%) scale(0.95)';
                                    setTimeout(() => {
                                        nodeEl.style.transform = 'translate(-50%, -50%) scale(1)';
                                    }, 100 + idx * 50);
                                }
                            }
                        });
                    }, 50);
                }
            }

            console.log('Updated expanded nodes:', Array.from(newExpanded));
            return newExpanded;
        });
    };


    // Handle mouse down for canvas panning
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only proceed with left click

        // Check if clicked on background (not a node)
        if ((e.target as HTMLElement).closest('.node')) {
            return;
        }

        setIsDragging(true);
        dragStartPositionRef.current = {
            x: e.clientX - viewState.position.x,
            y: e.clientY - viewState.position.y
        };

        // Change cursor style when dragging
        if (viewContainerRef.current) {
            viewContainerRef.current.style.cursor = 'grabbing';
        }
    };

    // Handle mouse move for either canvas panning or node dragging
    const handleMouseMove = (e: React.MouseEvent) => {
        // Handle node dragging
        if (nodeDragRef.current) {
            const { id, startX, startY } = nodeDragRef.current;
            const dx = (e.clientX - startX) / viewState.scale;
            const dy = (e.clientY - startY) / viewState.scale;

            // Update node position
            const updatedNodes = nodes.map(node =>
                node.id === id
                    ? { ...node, x: node.x + dx, y: node.y + dy }
                    : node
            );

            // Find the dragged node to determine its type
            const draggedNode = nodes.find(n => n.id === id);

            if (draggedNode) {
                // If dragging an endpoint, move all its child response nodes too
                if (draggedNode.type === 'endpoint') {
                    const responsePrefix = `response-${id.replace('endpoint-', '')}`;

                    updatedNodes.forEach(node => {
                        if (node.id.startsWith(responsePrefix)) {
                            node.x += dx;
                            node.y += dy;
                        }
                    });
                }

                // If dragging a response, we need to check if it's part of a response group
                else if (draggedNode.type === 'response') {
                    // Extract the endpoint ID from the response ID
                    const endpointId = draggedNode.id.split('-').slice(1, -1).join('-');
                    const isGrouped = endpointId && expandedNodes.has(`endpoint-${endpointId}`);

                    // If this response belongs to an expanded endpoint, move all sibling responses too
                    if (isGrouped) {
                        const responseGroup = `response-${endpointId}`;

                        updatedNodes.forEach(node => {
                            if (node.id.startsWith(responseGroup) && node.id !== draggedNode.id) {
                                node.x += dx;
                                node.y += dy;
                            }
                        });
                    }
                }
            }

            nodeDragRef.current = {
                id,
                startX: e.clientX,
                startY: e.clientY
            };

            return;
        }

        // Handle canvas dragging
        if (!isDragging || !dragStartPositionRef.current) return;

        const newPosition = {
            x: e.clientX - dragStartPositionRef.current.x,
            y: e.clientY - dragStartPositionRef.current.y
        };

        setViewState(prev => ({
            ...prev,
            position: newPosition
        }));
    };

    // Handle mouse up to end any dragging operations
    const handleMouseUp = () => {
        setIsDragging(false);
        dragStartPositionRef.current = null;
        nodeDragRef.current = null;

        // Reset cursor style
        if (viewContainerRef.current) {
            viewContainerRef.current.style.cursor = 'grab';
        }
    };

    // Handle node dragging
    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        nodeDragRef.current = {
            id: nodeId,
            startX: e.clientX,
            startY: e.clientY
        };
    };

    // Render edges (connections between nodes)
    const renderEdges = () => {
        return edges.map(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);

            if (!sourceNode || !targetNode) return null;

            // Different edge styles based on connection type
            if (edge.type === 'straight') {
                // Straight lines for response connections
                return (
                    <svg
                        key={edge.id}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        style={{ zIndex: 1 }}
                    >
                        <line
                            x1={sourceNode.x}
                            y1={sourceNode.y}
                            x2={targetNode.x}
                            y2={targetNode.y}
                            stroke="rgba(107, 114, 128, 0.5)"
                            strokeWidth="2"
                            strokeDasharray={edge.dashed ? "5,5" : ""}
                        />
                    </svg>
                );
            } else if (edge.type === 'tree') {
                // Tree-style connections for responses to indicate hierarchy
                const midY = sourceNode.y + (targetNode.y - sourceNode.y) / 2;

                return (
                    <svg
                        key={edge.id}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        style={{ zIndex: 1 }}
                    >
                        <path
                            d={`M ${sourceNode.x} ${sourceNode.y} 
                               L ${sourceNode.x} ${midY} 
                               L ${targetNode.x} ${midY} 
                               L ${targetNode.x} ${targetNode.y}`}
                            fill="none"
                            stroke="rgba(107, 114, 128, 0.5)"
                            strokeWidth="2"
                        />
                    </svg>
                );
            } else {
                // Bezier curves for API to endpoint connections
                // Calculate control points for a nicer curve
                const dx = targetNode.x - sourceNode.x;
                const dy = targetNode.y - sourceNode.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Adjust control point distance based on the distance between nodes
                const controlPointDistance = distance / 2.5;

                const controlPoint1X = sourceNode.x;
                const controlPoint1Y = sourceNode.y + controlPointDistance;

                const controlPoint2X = targetNode.x;
                const controlPoint2Y = targetNode.y - controlPointDistance;

                return (
                    <svg
                        key={edge.id}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        style={{ zIndex: 1 }}
                    >
                        <path
                            d={`M ${sourceNode.x} ${sourceNode.y} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${targetNode.x} ${targetNode.y}`}
                            fill="none"
                            stroke="rgba(107, 114, 128, 0.6)"
                            strokeWidth="2"
                        />
                    </svg>
                );
            }
        });
    };

    // Check if a node is a child response of an expanded endpoint
    const isChildResponse = (node) => {
        if (node.type !== 'response') return false;

        // Extract the endpoint ID from the response ID
        const parts = node.id.split('-');
        if (parts.length < 3) return false;

        // The format should be "response-endpointId-statusCode"
        // We need to extract just the endpointId part
        parts.shift(); // Remove "response"
        parts.pop(); // Remove statusCode
        const endpointId = `endpoint-${parts.join('-')}`;

        // Check if the parent endpoint is expanded
        return expandedNodes.has(endpointId);
    };

    // Render nodes (API, endpoints, responses)
    const renderNodes = () => {
        return nodes.map(node => {
            // Determine if this is a child response that should be shown
            const isChild = isChildResponse(node);

            // Skip rendering response nodes unless they're visible (parent endpoint expanded)
            if (node.type === 'response' && !isChild && !node.alwaysVisible) {
                return null;
            }

            // Add visual cues for draggability
            const dragHandleClass = "cursor-move opacity-50 hover:opacity-100 transition-opacity";

            // API node
            if (node.type === 'api') {
                return (
                    <div
                        key={node.id}
                        className="absolute p-4 rounded-lg bg-gray-800 border border-gray-700 shadow-lg node"
                        style={{
                            left: node.x,
                            top: node.y,
                            transform: 'translate(-50%, -50%)',
                            minWidth: '200px',
                            zIndex: 10
                        }}
                    >
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex-1"></div>
                            <div
                                className={dragHandleClass}
                                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            >
                                <Move size={16} className="text-slate-400" />
                            </div>
                        </div>
                        <div className="font-bold text-center text-lg text-slate-100">{node.data.label}</div>
                        <div className="text-xs text-center text-slate-400 mt-1">
                            v{node.data.version}
                        </div>
                    </div>
                );
            }

            // Endpoint node
            if (node.type === 'endpoint') {
                const isExpanded = expandedNodes.has(node.id);
                const totalResponses = node.data.responses?.length || 0;

                // Count visible responses
                const visibleResponses = isExpanded ? totalResponses : 0;

                return (
                    <div
                        key={node.id}
                        className="absolute p-4 rounded-lg bg-gray-800 border border-gray-700 shadow-md node transition-all duration-200"
                        style={{
                            left: node.x,
                            top: node.y,
                            transform: 'translate(-50%, -50%)',
                            minWidth: '220px',
                            zIndex: 5,
                            borderColor: isExpanded ? 'rgba(79, 70, 229, 0.5)' : 'rgba(75, 85, 99, 0.5)'
                        }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <Badge className={`${getMethodColor(node.data.method)}`}>
                                {node.data.method}
                            </Badge>
                            <div className="flex items-center space-x-2">
                                <div
                                    className="cursor-pointer hover:bg-gray-700 p-1 rounded-md transition-colors"
                                    onClick={() => handleToggleNodeExpansion(node.id)}
                                >
                                    {isExpanded ?
                                        <ChevronDown size={16} className="text-slate-300" /> :
                                        <ChevronRight size={16} className="text-slate-300" />
                                    }
                                </div>
                                <div
                                    className={dragHandleClass}
                                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                >
                                    <Move size={16} className="text-slate-400" />
                                </div>
                            </div>
                        </div>
                        <div className="font-medium text-slate-200 break-words">{node.data.path}</div>
                        {node.data.summary && (
                            <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                                {node.data.summary}
                            </div>
                        )}
                        <div className="text-xs text-slate-400 mt-1 flex items-center">
                            <span>
                                {isExpanded ? (
                                    <span className="text-indigo-400">{visibleResponses} / {totalResponses} responses</span>
                                ) : (
                                    <span>{totalResponses} responses</span>
                                )}
                            </span>
                            {isExpanded && totalResponses > 0 && (
                                <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse"></span>
                            )}
                        </div>
                    </div>
                );
            }

            // Response node
            if (node.type === 'response') {
                const isExpanded = isChild;

                return (
                    <div
                        key={node.id}
                        className="absolute p-4 rounded-lg bg-gray-800 border border-gray-700 shadow-md node"
                        style={{
                            left: node.x,
                            top: node.y,
                            transform: 'translate(-50%, -50%)',
                            minWidth: '220px',
                            zIndex: 3,
                            opacity: isExpanded ? 1 : 0,
                            visibility: isExpanded ? 'visible' : 'hidden',
                            maxHeight: isExpanded ? '500px' : '0',
                            transition: 'opacity 300ms ease-in-out, visibility 300ms ease-in-out, max-height 300ms ease-in-out'
                        }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <Badge className={`${getStatusColor(node.data.statusCode)}`}>
                                {node.data.statusCode}
                            </Badge>
                            <div
                                className={dragHandleClass}
                                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            >
                                <Move size={16} className="text-slate-400" />
                            </div>
                        </div>
                        <div className="text-sm text-slate-200">{node.data.description}</div>
                        {node.data.content && (
                            <div className="mt-2 text-xs bg-gray-700 p-2 rounded max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 text-slate-300">
                                <pre>{JSON.stringify(node.data.content, null, 2)}</pre>
                            </div>
                        )}
                    </div>
                );
            }

            return null;
        });
    };

    // Minimap component
    const Minimap = () => {
        const minimapScale = 0.15;
        const minimapWidth = 180;
        const minimapHeight = 120;

        return (
            <div className="absolute bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-md overflow-hidden shadow-lg" style={{ width: minimapWidth, height: minimapHeight }}>
                <div className="relative w-full h-full">
                    {/* Minimap content */}
                    <div
                        className="absolute"
                        style={{
                            transform: `scale(${minimapScale})`,
                            transformOrigin: '0 0'
                        }}
                    >
                        {renderEdges()}
                        {renderNodes()}
                    </div>

                    {/* Viewport indicator */}
                    <div
                        className="absolute border-2 border-indigo-500 pointer-events-none"
                        style={{
                            left: -viewState.position.x * minimapScale,
                            top: -viewState.position.y * minimapScale,
                            width: (viewContainerRef.current?.clientWidth || 0) * minimapScale / viewState.scale,
                            height: (viewContainerRef.current?.clientHeight || 0) * minimapScale / viewState.scale
                        }}
                    ></div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-slate-200">
            {/* Original Navbar Component */}
            <Navbar />

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar - using shadcn components */}
                <Card className="w-64 bg-gray-800 border-gray-700 shadow-lg mr-6">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold text-slate-100">API Specifications</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <ScrollArea className="h-[calc(100vh-220px)]">
                            {isLoading ? (
                                <div className="text-center p-4">
                                    <div className="text-slate-400">Loading specs...</div>
                                </div>
                            ) : specs.length === 0 ? (
                                <p className="text-slate-400 italic">No API specs found</p>
                            ) : (
                                <div className="space-y-2">
                                    {specs.map(spec => (
                                        <div
                                            key={spec.id}
                                            className={`p-2 rounded cursor-pointer hover:bg-gray-700 transition-colors ${selectedSpec?.id === spec.id ? 'bg-gray-700 border border-gray-600' : ''}`}
                                            onClick={() => handleSelectSpec(spec)}
                                        >
                                            <div className="font-medium text-slate-200 break-words">{spec.name}</div>
                                            <div className="flex justify-between text-xs text-slate-400">
                                                <span>v{spec.version}</span>
                                                <span>{new Date(spec.lastModified).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Main view area */}
                <div className="flex-1 flex flex-col">
                    {/* Toolbar with improved zoom controls - using shadcn components */}
                    <Card className="bg-gray-800 border-gray-700 mb-2 rounded-none">
                        <div className="flex items-center justify-between p-2">
                            <div>
                                {selectedSpec && (
                                    <div className="flex items-center">
                                        <span className="font-medium text-slate-200">{selectedSpec.name}</span>
                                        <Badge variant="outline" className="ml-2 border-gray-600">v{selectedSpec.version}</Badge>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center space-x-3">
                                <Button
                                    onClick={() => handleZoom(-0.1)}
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 bg-gray-700 border-gray-600 hover:bg-gray-600 hover:text-slate-100"
                                >
                                    <ZoomOut size={16} />
                                </Button>
                                <span className="text-sm font-medium text-slate-300">{Math.round(viewState.scale * 100)}%</span>
                                <Button
                                    onClick={() => handleZoom(0.1)}
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 bg-gray-700 border-gray-600 hover:bg-gray-600 hover:text-slate-100"
                                >
                                    <ZoomIn size={16} />
                                </Button>
                                <Button
                                    onClick={resetView}
                                    variant="outline"
                                    size="sm"
                                    className="bg-gray-700 border-gray-600 hover:bg-gray-600 hover:text-slate-100"
                                >
                                    <RotateCcw size={16} className="mr-1" />
                                    Reset View
                                </Button>
                                <Button
                                    onClick={() => setExpandedNodes(new Set())}
                                    variant="outline"
                                    size="sm"
                                    className="bg-gray-700 border-gray-600 hover:bg-gray-600 hover:text-slate-100"
                                    title="Collapse all nodes"
                                >
                                    <RefreshCw size={16} className="mr-1" />
                                    Collapse All
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* View area with drag/pan functionality */}
                    <div
                        className="flex-1 overflow-hidden bg-gray-900 relative"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        ref={viewContainerRef}
                        style={{ cursor: 'grab' }}
                    >
                        {parsingError && (
                            <div className="absolute top-4 left-4 right-4 bg-red-900/70 text-slate-200 p-3 rounded-md z-50">
                                <p className="font-medium">Error parsing specification</p>
                                <p className="text-sm text-slate-300">{parsingError}</p>
                            </div>
                        )}

                        <div
                            className="absolute w-full h-full"
                            style={{
                                transform: `translate(${viewState.position.x}px, ${viewState.position.y}px) scale(${viewState.scale})`,
                                transformOrigin: '0 0',
                            }}
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-slate-400">Loading visualization...</div>
                                </div>
                            ) : selectedSpec ? (
                                <>
                                    {renderEdges()}
                                    {renderNodes()}
                                </>
                            ) : (
                                <Card className="bg-gray-800 border-gray-700 shadow-lg p-8" style={{ width: '400px', margin: '100px auto' }}>
                                    <p className="text-slate-300 text-center">Select an API specification from the sidebar to view its endpoints</p>
                                </Card>
                            )}
                        </div>

                        {/* Minimap */}
                        {selectedSpec && !isLoading && <Minimap />}

                        {/* Drag indicator */}
                        {isDragging && (
                            <div className="fixed bottom-4 left-4 bg-gray-800 text-slate-200 px-3 py-2 rounded-md shadow-lg z-50 flex items-center">
                                <Move size={16} className="mr-2" />
                                <span>Dragging canvas</span>
                            </div>
                        )}

                        {/* Keyboard shortcuts help */}
                        <div className="absolute bottom-4 left-4 bg-gray-800/80 text-xs text-slate-300 px-3 py-2 rounded-md">
                            <div>Wheel: Zoom in/out</div>
                            <div>Drag: Pan view</div>
                            <div>Click endpoint: Expand/collapse responses</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OpenAPIViewer;