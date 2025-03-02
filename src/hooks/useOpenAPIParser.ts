// hooks/useOpenAPIParser.ts
import { useState, useEffect, useRef } from 'react';
import kebabCase from 'lodash/kebabCase';
import get from 'lodash/get';
import SwaggerClient from 'swagger-client';
import OpenAPIParser from '@readme/openapi-parser';

// Types
export interface ApiSpec {
    id: string;
    name: string;
    content: any;
    lastModified: number;
    format: string;
    version: string;
    tags?: any[];
    favorite?: boolean;
}

export interface Endpoint {
    id: string;
    path: string;
    method: string;
    summary: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    requestBody?: any;
    responses: Response[];
}

export interface Parameter {
    name: string;
    in: string;
    description?: string;
    required?: boolean;
    type: string;
    format?: string;
}

export interface Response {
    statusCode: string;
    description: string;
    content?: any;
}

export interface Node {
    id: string;
    type: 'api' | 'endpoint' | 'response';
    x: number;
    y: number;
    data: any;
    expanded?: boolean;
}

export interface Edge {
    id: string;
    source: string;
    target: string;
    type: string;
}

// Validation types
export interface ValidationError {
    path?: string;
    message: string;
    severity: 'error' | 'warning';
}

// Utilities
export const contentResolver = (contentObj: any) => {
    if (!contentObj || typeof contentObj !== 'object') {
        return { type: '', schema: null };
    }

    const type = Object.keys(contentObj)[0] ?? '';
    const schema = get(contentObj, `${type}.schema`, null);
    return { type, schema };
};

export const resolveResponseContent = (content: any) => {
    if (!content) return undefined;

    // If it's already a processed content object, return it
    if (content.type || content.schema) return content;

    return contentResolver(content);
};

const methodDataMapper = ({ path, method, methodObj }: { path: string; method: string; methodObj: any }) => {
    // Get method properties
    const summary: string = get(methodObj, 'summary', '');
    const description: string = get(methodObj, 'description', '');
    const id: string = get(methodObj, 'operationId', '');
    const tags = get(methodObj, 'tags', []);

    // Get parameters
    const parametersArr = get(methodObj, 'parameters', []);
    const parameters = parametersArr.map((param: any) => ({
        name: param.name || '',
        in: param.in || '',
        description: param.description || '',
        required: param.required || false,
        type: get(param, 'schema.type', get(param, 'type', 'string')),
        format: get(param, 'schema.format', get(param, 'format', undefined))
    }));

    // Get requestBody if it exists
    const requestBody = get(methodObj, 'requestBody', undefined);

    // Get responses
    const responsesObj = get(methodObj, 'responses', {});
    const responses = Object.entries(responsesObj).map(([statusCode, responseObj]: [string, any]) => {
        // Handle both string and object responses
        if (typeof responseObj === 'string') {
            return {
                statusCode,
                description: responseObj,
                content: undefined
            };
        }

        // Handle response object with proper content resolution
        const contentObj = get(responseObj, 'content', {});
        const content = resolveResponseContent(contentObj);

        return {
            statusCode,
            description: get(responseObj, 'description', ''),
            content
        };
    });

    return {
        id: id ? kebabCase(id) : `${method.toLowerCase()}-${path.replace(/\//g, '-').replace(/[{}]/g, '_')}`,
        method: method.toUpperCase(),
        path,
        summary,
        description,
        tags,
        parameters,
        requestBody,
        responses
    };
};

    // Validation functions
export const validateSpecFormat = (spec: any): ValidationError[] => {
    const errors: ValidationError[] = [];
    
    if (!spec) {
        errors.push({ 
            message: 'Specification is empty or undefined', 
            severity: 'error' 
        });
        return errors;
    }

    // Check for minimum required OpenAPI fields
    if (!spec.openapi && !spec.swagger) {
        errors.push({ 
            message: 'Invalid API spec format: Missing OpenAPI/Swagger version identifier', 
            severity: 'error'
        });
    } else {
        // Check version compatibility
        const version = spec.openapi || spec.swagger;
        if (spec.openapi && !['3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.1.0'].includes(version)) {
            errors.push({ 
                message: `OpenAPI version ${version} may not be fully supported. Recommended versions: 3.0.x or 3.1.0`, 
                severity: 'warning'
            });
        } else if (spec.swagger && version !== '2.0') {
            errors.push({ 
                message: `Swagger version ${version} may not be fully supported. Recommended version: 2.0`, 
                severity: 'warning'
            });
        }
    }

    if (!spec.info) {
        errors.push({ 
            message: 'Missing required "info" object in specification', 
            severity: 'error'
        });
    } else {
        if (!spec.info.title) {
            errors.push({ 
                path: 'info.title',
                message: 'API specification is missing required title', 
                severity: 'error'
            });
        }
        
        if (!spec.info.version) {
            errors.push({ 
                path: 'info.version',
                message: 'API specification is missing version information', 
                severity: 'error'
            });
        }
    }

    if (!spec.paths || Object.keys(spec.paths).length === 0) {
        errors.push({ 
            message: 'API specification contains no endpoints (empty paths object)', 
            severity: 'warning'
        });
    } else {
        // Check if paths have any operations
        const hasOperations = Object.values(spec.paths).some((pathObj: any) => {
            return Object.keys(pathObj).some(key => 
                ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(key.toLowerCase())
            );
        });
        
        if (!hasOperations) {
            errors.push({ 
                path: 'paths',
                message: 'API specification contains paths but no HTTP operations (GET, POST, etc.)', 
                severity: 'warning'
            });
        }
    }

    return errors;
};

// Main hook with enhanced validation
export const useSpecParser = (spec: ApiSpec | null) => {
    const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
    const [specVersion, setSpecVersion] = useState<string>('');

    useEffect(() => {
        if (!spec) {
            setEndpoints([]);
            setError(null);
            setValidationErrors([]);
            setSpecVersion('');
            return;
        }

        setIsLoading(true);
        setError(null);
        setValidationErrors([]);

        const parseSwaggerSpec = async () => {
            try {
                // Initialize variables for content
                let jsonContent;
                let tempUrl = null;
                
                try {
                    // Handle parsing based on content type
                    if (typeof spec.content === 'string') {
                        // Since OpenAPIParser.parse expects a file path, we need to create a Blob URL
                        try {
                            // Create a Blob containing the specification content
                            const specBlob = new Blob([spec.content], { 
                                type: spec.format === 'yaml' ? 'application/yaml' : 'application/json' 
                            });
                            
                            // Create a URL for the Blob
                            tempUrl = URL.createObjectURL(specBlob);
                            
                            try {
                                // Use OpenAPIParser.parse with the temporary URL
                                jsonContent = await OpenAPIParser.parse(tempUrl);
                            } catch (parserError) {
                                console.warn('OpenAPIParser failed with Blob URL, trying direct parsing:', parserError);
                                
                                // Try direct parsing if OpenAPIParser fails with Blob URL
                                if (spec.format === 'yaml' || spec.content.trim().startsWith('openapi:') || spec.content.trim().startsWith('swagger:')) {
                                    // Try YAML
                                    const jsyaml = await import('js-yaml');
                                    jsonContent = jsyaml.load(spec.content);
                                } else {
                                    // Try JSON
                                    jsonContent = JSON.parse(spec.content);
                                }
                            }
                        } catch (blobError) {
                            console.error('Error with Blob URL approach:', blobError);
                            
                            // Fallback: Try direct parsing if Blob approach fails
                            try {
                                // Try JSON parse first
                                jsonContent = JSON.parse(spec.content);
                            } catch (jsonError) {
                                try {
                                    // If JSON fails, try YAML
                                    const jsyaml = await import('js-yaml');
                                    jsonContent = jsyaml.load(spec.content);
                                } catch (yamlError) {
                                    throw new Error(`Failed to parse spec content: ${blobError.message || 'Invalid format'}`);
                                }
                            }
                        }
                    } else if (typeof spec.content === 'object' && spec.content !== null) {
                        // If content is already an object, use it directly
                        jsonContent = spec.content;
                    } else {
                        throw new Error('Invalid specification format - must be a string or object');
                    }
                    
                    // Run basic schema validation
                    const initialValidationErrors = validateSpecFormat(jsonContent);
                    
                    if (initialValidationErrors.some(err => err.severity === 'error')) {
                        // If there are validation errors, set them but still try to parse
                        setValidationErrors(initialValidationErrors);
                    }
                    
                    // Determine spec version
                    const version = jsonContent.openapi ? 
                        `OpenAPI ${jsonContent.openapi}` : 
                        (jsonContent.swagger ? `Swagger ${jsonContent.swagger}` : 'Unknown');
                    setSpecVersion(version);
                    
                } catch (parseError: any) {
                    console.error('Error in initial parsing:', parseError);
                    setError(`Failed to parse API specification: ${parseError.message}`);
                    setValidationErrors([{
                        message: `Content parsing error: ${parseError.message}`,
                        severity: 'error'
                    }]);
                    setEndpoints([]);
                    setIsLoading(false);
                    return;
                } finally {
                    // Clean up any temporary URL
                    if (tempUrl) {
                        URL.revokeObjectURL(tempUrl);
                    }
                }

                // Try to resolve with Swagger Client
                try {
                    // Store original content size for potential error messages
                    const contentSize = typeof jsonContent === 'string' 
                        ? jsonContent.length 
                        : JSON.stringify(jsonContent).length;
                    
                    const parsedSpec = await SwaggerClient.resolve({
                        spec: jsonContent,
                        allowMetaPatches: true,
                        validateSchema: true,
                        skipValidation: false
                    });

                    // Access the resolved and normalized spec
                    const api = parsedSpec.spec;

                    // Extract endpoints
                    const extractedEndpoints: Endpoint[] = [];

                    // Get paths from the resolved spec
                    const paths = get(api, 'paths', {});

                    // Check if we actually got any paths
                    if (Object.keys(paths).length === 0) {
                        setValidationErrors(prev => [
                            ...prev,
                            { 
                                message: 'API specification contains no paths or endpoints',
                                severity: 'warning'
                            }
                        ]);
                    }

                    // Process each path and method
                    Object.entries(paths).forEach(([path, pathObj]: [string, any]) => {
                        // Process HTTP methods
                        const methods = ['get', 'post', 'put', 'delete', 'patch', 'options'];

                        methods.forEach(method => {
                            if (pathObj[method]) {
                                try {
                                    const endpoint = methodDataMapper({
                                        path,
                                        method,
                                        methodObj: pathObj[method]
                                    });
                                    
                                    extractedEndpoints.push(endpoint);
                                } catch (methodError: any) {
                                    console.warn(`Error mapping method ${method} for path ${path}:`, methodError);
                                    
                                    // Create more specific error message based on the issue
                                    let errorMessage = `Error processing endpoint ${method.toUpperCase()} ${path}`;
                                    
                                    if (methodError.message) {
                                        if (methodError.message.includes('parameters')) {
                                            errorMessage = `Invalid parameters in ${method.toUpperCase()} ${path}`;
                                        } else if (methodError.message.includes('responses')) {
                                            errorMessage = `Invalid responses in ${method.toUpperCase()} ${path}`;
                                        } else if (methodError.message.includes('requestBody')) {
                                            errorMessage = `Invalid request body in ${method.toUpperCase()} ${path}`;
                                        }
                                    }
                                    
                                    setValidationErrors(prev => [
                                        ...prev,
                                        { 
                                            path: `paths.${path}.${method}`,
                                            message: errorMessage,
                                            severity: 'warning'
                                        }
                                    ]);
                                }
                            }
                        });
                    });

                    setEndpoints(extractedEndpoints);
                } catch (swaggerError: any) {
                    console.error('Error parsing spec with Swagger Client:', swaggerError);
                    
                    // Extract meaningful error information without exposing the entire spec
                    const errorMessage = swaggerError.message || 'Unknown error';
                    
                    // Sanitize error message to remove full spec details
                    const sanitizedError = errorMessage
                        .replace(/\{[^{}]*\}/g, '{...}') // Replace JSON objects
                        .replace(/with value "[^"]{50,}"/g, 'with long value "[...]"'); // Replace long values
                    
                    // Provide detailed error messages based on error type
                    if (errorMessage.includes('schema')) {
                        // Extract specific schema validation issue
                        const schemaMatch = errorMessage.match(/[\w.]+ (is|requires|must|should) [^.]+/);
                        const specificError = schemaMatch ? schemaMatch[0] : 'Schema format is invalid';
                        
                        setError(`Schema validation failed: ${specificError}`);
                        
                        setValidationErrors(prev => [
                            ...prev,
                            {
                                message: `Schema error: ${specificError}`,
                                severity: 'error'
                            }
                        ]);
                    } else if (errorMessage.includes('reference')) {
                        // Extract specific reference
                        const refMatch = errorMessage.match(/\$ref[^\s]+/);
                        const reference = refMatch ? refMatch[0] : 'a reference';
                        
                        setError(`Invalid reference in specification: Could not resolve ${reference}`);
                        
                        setValidationErrors(prev => [
                            ...prev,
                            {
                                message: `Reference error: Could not resolve ${reference}`,
                                severity: 'error'
                            }
                        ]);
                    } else if (errorMessage.includes('is not of a type')) {
                        const typeMatch = errorMessage.match(/([\w.]+) is not of a type\(s\) ([\w,]+)/);
                        if (typeMatch) {
                            setError(`Type error: ${typeMatch[1]} should be ${typeMatch[2]}`);
                        } else {
                            setError(`Type error in specification: ${sanitizedError}`);
                        }
                    } else if (errorMessage.includes('required property')) {
                        const propMatch = errorMessage.match(/missing required property ['"]([^'"]+)['"]/);
                        if (propMatch) {
                            setError(`Missing required property: '${propMatch[1]}'`);
                        } else {
                            setError(`Missing required property in specification`);
                        }
                    } else {
                        setError(`Failed to parse specification: ${sanitizedError.substring(0, 200)}`);
                    }
                    
                    setEndpoints([]);
                }
            } catch (generalError: any) {
                console.error('Unexpected error during spec parsing:', generalError);
                
                // Create a user-friendly error message
                let userMessage = 'Failed to process API specification';
                
                if (generalError.message) {
                    // Extract the most relevant part of the error without including the spec
                    const cleanedMessage = generalError.message
                        .replace(/\{[\s\S]*?\}/g, '{...}') // Remove JSON objects
                        .replace(/(spec|document|content): "[^"]{30,}"/g, '$1: "[...]"') // Remove long content
                        .replace(/line \d+, column \d+/g, 'specific location'); // Keep location mentions generic
                    
                    // Limit error message length
                    const briefMessage = cleanedMessage.length > 100 
                        ? cleanedMessage.substring(0, 100) + '...' 
                        : cleanedMessage;
                    
                    userMessage += `: ${briefMessage}`;
                }
                
                setError(userMessage);
                
                // Add to validation errors
                setValidationErrors(prev => [
                    ...prev,
                    {
                        message: 'The API specification has errors that prevent it from being parsed correctly',
                        severity: 'error'
                    }
                ]);
                
                setEndpoints([]);
            } finally {
                setIsLoading(false);
            }
        };

        parseSwaggerSpec();
    }, [spec]);

    return { endpoints, isLoading, error, validationErrors, specVersion };
};

// Hook for graph visualization
export const useGraphVisualization = (endpoints: Endpoint[], apiName: string, apiVersion: string) => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);

    useEffect(() => {
        if (!endpoints.length) {
            setNodes([]);
            setEdges([]);
            return;
        }

        // Generate nodes and edges
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Create API root node
        const rootNodeId = `api-root`;
        newNodes.push({
            id: rootNodeId,
            type: 'api',
            x: 400,
            y: 100,
            data: {
                label: apiName,
                version: apiVersion
            }
        });

        // Position endpoints in a radial layout with minimum distance between them
        const calculatePosition = (index: number, total: number) => {
            // Use golden angle to distribute points
            const goldenAngle = Math.PI * (3 - Math.sqrt(5));
            const angle = index * goldenAngle;

            // Adjust radius based on number of items for better spacing
            const radiusBase = 250;
            const radius = radiusBase + (index % 3) * 50; // Add some variation for better distribution

            return {
                x: 400 + radius * Math.cos(angle),
                y: 300 + radius * Math.sin(angle)
            };
        };

        // Create nodes for each endpoint
        endpoints.forEach((endpoint, index) => {
            const position = calculatePosition(index, endpoints.length);
            const endpointNodeId = `endpoint-${endpoint.id}`;

            newNodes.push({
                id: endpointNodeId,
                type: 'endpoint',
                x: position.x,
                y: position.y,
                data: {
                    label: endpoint.path,
                    method: endpoint.method,
                    summary: endpoint.summary,
                    description: endpoint.description,
                    responses: endpoint.responses
                },
                expanded: false
            });

            // Connect endpoint to API root
            newEdges.push({
                id: `edge-root-${endpoint.id}`,
                source: rootNodeId,
                target: endpointNodeId,
                type: 'bezier'
            });
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [endpoints, apiName, apiVersion]);

    // Toggle node expansion to show responses
    const toggleNodeExpansion = (nodeId: string) => {
        // Find the node
        const node = nodes.find(n => n.id === nodeId);
        if (!node || node.type !== 'endpoint') return;

        // Update expanded state
        setNodes(prev =>
            prev.map(n =>
                n.id === nodeId
                    ? { ...n, expanded: !n.expanded }
                    : n
            )
        );

        // If expanding, add response nodes
        if (!node.expanded) {
            // Get endpoint data (responses)
            const endpointId = nodeId.replace('endpoint-', '');
            const endpointNode = nodes.find(n => n.id === nodeId);
            if (!endpointNode) return;

            const responses = endpointNode.data.responses || [];

            // Create response nodes
            const responseNodes: Node[] = [];
            const responseEdges: Edge[] = [];

            // Position response nodes in a column below the endpoint
            responses.forEach((response: Response, index: number) => {
                const responseNodeId = `response-${endpointId}-${response.statusCode}`;

                // Position response nodes below the endpoint
                responseNodes.push({
                    id: responseNodeId,
                    type: 'response',
                    x: node.x,
                    y: node.y + 120 + (index * 80),
                    data: {
                        statusCode: response.statusCode,
                        description: response.description,
                        content: response.content
                    }
                });

                // Connect response to endpoint
                responseEdges.push({
                    id: `edge-${nodeId}-${responseNodeId}`,
                    source: nodeId,
                    target: responseNodeId,
                    type: 'straight'
                });
            });

            // Add new nodes and edges
            setNodes(prev => [...prev, ...responseNodes]);
            setEdges(prev => [...prev, ...responseEdges]);
        } else {
            // If collapsing, remove response nodes and edges
            const endpointId = nodeId.replace('endpoint-', '');

            // Remove response nodes
            setNodes(prev =>
                prev.filter(n => !n.id.startsWith(`response-${endpointId}`))
            );

            // Remove response edges
            setEdges(prev =>
                prev.filter(e => !e.id.startsWith(`edge-${nodeId}`))
            );
        }
    };

    return { nodes, edges, toggleNodeExpansion };
};

// Hook for localStorage operations
export const useLocalStorageSpecs = (storageKey: string) => {
    const [specs, setSpecs] = useState<ApiSpec[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [storageError, setStorageError] = useState<string | null>(null);

    // Load specs from localStorage
    useEffect(() => {
        try {
            setIsLoading(true);
            setStorageError(null);
            const storedSpecs = localStorage.getItem(storageKey);

            if (storedSpecs) {
                try {
                    const parsedData = JSON.parse(storedSpecs);
                    if (Array.isArray(parsedData)) {
                        setSpecs(parsedData);
                    } else if (typeof parsedData === 'object' && parsedData !== null) {
                        // Handle single object case
                        setSpecs([parsedData]);
                    } else {
                        throw new Error('Invalid data format in localStorage');
                    }
                } catch (parseError: any) {
                    console.error('Error parsing specs JSON:', parseError);
                    setStorageError(`Failed to parse stored data: ${parseError.message}`);
                    setSpecs([]);
                }
            } else {
                // No specs found is normal for first-time use
                setSpecs([]);
            }
        } catch (error: any) {
            console.error('Error loading API specs:', error);
            setStorageError(`Failed to access localStorage: ${error.message}`);
            setSpecs([]);
        } finally {
            setIsLoading(false);
        }
    }, [storageKey]);

    // Save specs to localStorage
    const saveSpecs = (newSpecs: ApiSpec[]) => {
        try {
            setStorageError(null);
            localStorage.setItem(storageKey, JSON.stringify(newSpecs));
            setSpecs(newSpecs);
        } catch (error: any) {
            console.error('Error saving specs:', error);
            setStorageError(`Failed to save to localStorage: ${error.message}`);
        }
    };

    return { specs, isLoading, storageError, setSpecs: saveSpecs };
};

// Hook for view state management
export const useViewState = (initialScale = 1, initialPosition = { x: 0, y: 0 }) => {
    const [viewState, setViewState] = useState({
        scale: initialScale,
        position: initialPosition
    });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPositionRef = useRef<{ x: number; y: number } | null>(null);
    const nodeDragRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

    // Handle zoom controls
    const handleZoom = (amount: number) => {
        setViewState(prev => {
            // Limit scale between 0.1 and 5
            const newScale = Math.max(0.1, Math.min(5, prev.scale + amount));
            return { ...prev, scale: newScale };
        });
    };

    // Reset view
    const resetView = () => {
        setViewState({
            scale: initialScale,
            position: initialPosition
        });
    };

    return {
        viewState,
        setViewState,
        isDragging,
        setIsDragging,
        dragStartPositionRef,
        nodeDragRef,
        handleZoom,
        resetView
    };
};

// Utility functions for styling
export const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
        case 'GET': return 'bg-blue-600';
        case 'POST': return 'bg-green-600';
        case 'PUT': return 'bg-yellow-600';
        case 'DELETE': return 'bg-red-600';
        case 'PATCH': return 'bg-purple-600';
        default: return 'bg-gray-600';
    }
};

export const getStatusColor = (statusCode: string) => {
    const code = parseInt(statusCode, 10);
    if (code >= 200 && code < 300) return 'bg-green-600';
    if (code >= 300 && code < 400) return 'bg-blue-600';
    if (code >= 400 && code < 500) return 'bg-yellow-600';
    if (code >= 500) return 'bg-red-600';
    return 'bg-gray-600';
};

// Additional utility for getting validation error severity class
export const getValidationSeverityClass = (severity: 'error' | 'warning') => {
    return severity === 'error' ? 'text-red-500' : 'text-yellow-500';
};

// Helper function to format validation errors for display
export const formatValidationErrors = (errors: ValidationError[]): string => {
    if (!errors || errors.length === 0) return '';
    
    const errorCount = errors.filter(e => e.severity === 'error').length;
    const warningCount = errors.filter(e => e.severity === 'warning').length;
    
    let summary = '';
    if (errorCount > 0) {
        summary += `${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`;
    }
    
    if (warningCount > 0) {
        summary += summary ? ' and ' : '';
        summary += `${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`;
    }
    
    return `Your API specification has ${summary}. Please fix ${errorCount > 0 ? 'errors' : 'issues'} to ensure proper visualization.`;
};

// Helper function to get human-readable suggestions for common errors
export const getErrorSuggestion = (error: ValidationError): string | null => {
    const message = error.message.toLowerCase();
    
    if (message.includes('openapi') || message.includes('swagger')) {
        return 'Add the OpenAPI/Swagger version identifier at the root of your specification.';
    }
    
    if (message.includes('title') || message.includes('info object')) {
        return 'Add the required "info" object with "title" and "version" properties.';
    }
    
    if (message.includes('reference')) {
        return 'Check that all references ($ref) in your specification point to valid objects.';
    }
    
    if (message.includes('no paths') || message.includes('no endpoints')) {
        return 'Add at least one path with HTTP methods to your specification.';
    }
    
    if (message.includes('schema')) {
        return 'Verify that your schema definitions match the OpenAPI specification format.';
    }
    
    if (message.includes('blob') || message.includes('url')) {
        return 'Your browser may be restricting access to the Blob URL. Try importing a local file instead.';
    }
    
    return null;
};