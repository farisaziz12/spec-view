import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Save, FileUp, FileDown, Trash2, Copy, Check, X, FileText, Plus, RefreshCw, UploadIcon } from "lucide-react";
import yaml from "js-yaml";
import type { OpenAPIV3_1 } from "openapi-types";

const LOCAL_STORAGE_KEY = "spec_view_saved_specs";

// Enhanced type for saved specs
interface SavedSpec {
    id: string;
    name: string;
    content: string;
    lastModified: number;
    format: "yaml" | "json";
    version: string;
    tags?: string[];
    favorite?: boolean;
}

const toKebabCase = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const extractOpenAPIInfo = (content: string): { title: string; version: string; description?: string } => {
    try {
        const parsed = yaml.load(content) as OpenAPIV3_1.Document;
        return {
            title: parsed?.info?.title || "Untitled Spec",
            version: parsed?.info?.version || "1.0.0",
            description: parsed?.info?.description,
        };
    } catch {
        try {
            // Try parsing as JSON
            const parsed = JSON.parse(content);
            return {
                title: parsed?.info?.title || "Untitled Spec",
                version: parsed?.info?.version || "1.0.0",
                description: parsed?.info?.description,
            };
        } catch {
            return { title: "Untitled Spec", version: "1.0.0" };
        }
    }
};

const detectFormat = (content: string): "yaml" | "json" => {
    content = content.trim();
    if (content.startsWith("{") || content.startsWith("[")) {
        return "json";
    }
    return "yaml";
};

const convertFormat = (content: string, targetFormat: "yaml" | "json"): string => {
    try {
        const currentFormat = detectFormat(content);
        if (currentFormat === targetFormat) return content;

        if (currentFormat === "yaml" && targetFormat === "json") {
            const parsed = yaml.load(content);
            return JSON.stringify(parsed, null, 2);
        } else {
            // JSON to YAML
            const parsed = JSON.parse(content);
            return yaml.dump(parsed, { lineWidth: -1 });
        }
    } catch (error) {
        console.error("Failed to convert format:", error);
        return content;
    }
};

// Examples for new users
const EXAMPLE_SPECS = [
    {
        name: "Petstore API",
        content: `openapi: 3.1.0
info:
  title: Petstore API
  description: A sample API for pets
  version: 1.0.0
paths:
  /pets:
    get:
      summary: List all pets
      responses:
        '200':
          description: A list of pets
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
components:
  schemas:
    Pet:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        tag:
          type: string`,
        format: "yaml" as const,
    }
];

const EditorPage = () => {
    // State management
    const [specs, setSpecs] = useState<SavedSpec[]>([]);
    const [currentSpec, setCurrentSpec] = useState<SavedSpec | null>(null);
    const [editorValue, setEditorValue] = useState<string>("");
    const [specTitle, setSpecTitle] = useState<string>("");
    const [specVersion, setSpecVersion] = useState<string>("1.0.0");
    const [specFormat, setSpecFormat] = useState<"yaml" | "json">("yaml");
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useState<boolean>(true);
    const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
    const [specToDelete, setSpecToDelete] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState<boolean>(false);
    const [importValue, setImportValue] = useState<string>("");
    const [importName, setImportName] = useState<string>("");
    const [autoDetectTitle, setAutoDetectTitle] = useState<boolean>(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<any>(null);

    // Load saved specs on initial render
    useEffect(() => {
        const savedSpecs = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedSpecs) {
            try {
                const parsed = JSON.parse(savedSpecs);
                setSpecs(parsed);
            } catch (error) {
                console.error("Failed to parse saved specs:", error);
                setSpecs([]);
            }
        } else {
            // If no specs are saved, add example specs
            setSpecs(EXAMPLE_SPECS.map(spec => ({
                id: toKebabCase(spec.name),
                name: spec.name,
                content: spec.content,
                lastModified: Date.now(),
                format: spec.format,
                version: "1.0.0",
            })));
        }
    }, []);

    // Handle editor changes
    const handleEditorChange = (value: string | undefined) => {
        if (value !== undefined) {
            setEditorValue(value);
            setIsSaved(false);

            try {
                if (specFormat === "yaml") {
                    yaml.load(value);
                } else {
                    JSON.parse(value);
                }
                setError(null);

                // Auto-detect spec title and version if enabled
                if (autoDetectTitle) {
                    const { title, version } = extractOpenAPIInfo(value);
                    setSpecTitle(title);
                    setSpecVersion(version);
                }
            } catch (err) {
                if (err instanceof Error) {
                    setError(`Invalid ${specFormat.toUpperCase()} syntax: ${err.message}`);
                } else {
                    setError(`Invalid ${specFormat.toUpperCase()} syntax`);
                }
            }
        }
    };

// Save current spec
const saveSpec = () => {
    if (!editorValue.trim()) {
        setError("Cannot save empty specification");
        return;
    }

    try {
        // Validate content format
        if (specFormat === "yaml") {
            yaml.load(editorValue);
        } else {
            JSON.parse(editorValue);
        }

        const id = currentSpec?.id || `spec-${Date.now()}`;
        const newSpec: SavedSpec = {
            id,
            name: specTitle || "Untitled Spec",
            content: editorValue,
            lastModified: Date.now(),
            format: specFormat,
            version: specVersion,
            tags: currentSpec?.tags || [],
            favorite: currentSpec?.favorite || false,
        };

        console.log("Saving spec:", newSpec.name);

        // Create a new array with the updated or new spec
        const updatedSpecs = currentSpec
            ? specs.map(spec => (spec.id === currentSpec.id ? newSpec : spec))
            : [...specs, newSpec];
        
        // Update state with the new array
        setSpecs(updatedSpecs);
        
        // Make sure we update the current spec reference
        setCurrentSpec(newSpec);
        setIsSaved(true);
        setError(null);

        // Directly save to localStorage as a backup in case the useEffect doesn't trigger
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedSpecs));
            console.log("Directly saved to localStorage");
        } catch (storageError) {
            console.error("Failed to directly save to localStorage:", storageError);
        }

        // Show a temporary success message
        const savedMessage = document.getElementById("saved-message");
        if (savedMessage) {
            savedMessage.style.opacity = "1";
            setTimeout(() => {
                savedMessage.style.opacity = "0";
            }, 2000);
        }
    } catch (err) {
        if (err instanceof Error) {
            setError(`Failed to save: ${err.message}`);
            console.error("Validation error:", err);
        } else {
            setError("Failed to save specification");
            console.error("Unknown error during save:", err);
        }
    }
};

    // Load a spec into the editor
    const loadSpec = (spec: SavedSpec) => {
        if (!isSaved && currentSpec) {
            if (!window.confirm("You have unsaved changes. Continue without saving?")) {
                return;
            }
        }

        setCurrentSpec(spec);
        setEditorValue(spec.content);
        setSpecTitle(spec.name);
        setSpecVersion(spec.version);
        setSpecFormat(spec.format);
        setError(null);
        setIsSaved(true);
    };

    // Create a new spec
    const createNewSpec = () => {
        if (!isSaved && currentSpec) {
            if (!window.confirm("You have unsaved changes. Continue without saving?")) {
                return;
            }
        }

        setCurrentSpec(null);
        setEditorValue("");
        setSpecTitle("New Spec");
        setSpecVersion("1.0.0");
        setSpecFormat("yaml");
        setError(null);
        setIsSaved(true);
    };

    // Delete a spec
    const handleDelete = (id: string) => {
        setSpecToDelete(id);
        setShowDeleteDialog(true);
    };

    const confirmDelete = () => {
        if (specToDelete) {
            setSpecs(specs.filter(spec => spec.id !== specToDelete));
            if (currentSpec?.id === specToDelete) {
                createNewSpec();
            }
            setShowDeleteDialog(false);
            setSpecToDelete(null);
        }
    };

    // Import spec from text
    const handleImport = () => {
        if (!importValue.trim()) {
            setError("Cannot import empty specification");
            return;
        }

        try {
            // Detect format and validate
            const format = detectFormat(importValue);
            if (format === "yaml") {
                yaml.load(importValue);
            } else {
                JSON.parse(importValue);
            }

            // Extract spec info
            const { title, version } = extractOpenAPIInfo(importValue);

            const newSpec: SavedSpec = {
                id: `spec-${Date.now()}`,
                name: importName || title,
                content: importValue,
                lastModified: Date.now(),
                format,
                version,
            };

            setSpecs([...specs, newSpec]);
            setCurrentSpec(newSpec);
            setEditorValue(importValue);
            setSpecTitle(newSpec.name);
            setSpecVersion(version);
            setSpecFormat(format);
            setImportValue("");
            setImportName("");
            setIsImporting(false);
            setIsSaved(true);
            setError(null);
        } catch (err) {
            if (err instanceof Error) {
                setError(`Failed to import: ${err.message}`);
            } else {
                setError("Failed to import specification");
            }
        }
    };

    // Import from file
    const handleFileImport = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setImportValue(content);
            setImportName(file.name.replace(/\.(json|yaml|yml)$/, ""));
            setIsImporting(true);
        };
        reader.readAsText(file);

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    // Export current spec to file
    const handleExport = () => {
        if (!currentSpec) return;

        const blob = new Blob([currentSpec.content], {
            type: currentSpec.format === "yaml" ? "text/yaml" : "application/json"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${currentSpec.name}.${currentSpec.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Toggle format between YAML and JSON
    const handleFormatToggle = (format: "yaml" | "json") => {
        if (format === specFormat) return;

        try {
            const converted = convertFormat(editorValue, format);
            setEditorValue(converted);
            setSpecFormat(format);
            setIsSaved(false);
        } catch (error) {
            setError(`Failed to convert format: ${error}`);
        }
    };

    // Copy spec content to clipboard
    const handleCopy = (id: string) => {
        const spec = specs.find(s => s.id === id);
        if (spec) {
            navigator.clipboard.writeText(spec.content)
                .then(() => {
                    setCopiedId(id);
                    setTimeout(() => setCopiedId(null), 2000);
                })
                .catch(err => {
                    console.error("Failed to copy:", err);
                });
        }
    };

    // Toggle favorite status
    const toggleFavorite = (id: string) => {
        setSpecs(specs.map(spec =>
            spec.id === id ? { ...spec, favorite: !spec.favorite } : spec
        ));
    };

    // Filter specs based on search term
    const filteredSpecs = specs.filter(spec =>
        spec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (spec.tags && spec.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    // Sort specs by favorite first, then by last modified
    const sortedSpecs = [...filteredSpecs].sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        return b.lastModified - a.lastModified;
    });

    return (
        <>
            <Navbar />
            <SidebarProvider>
                <div className="flex h-screen w-full bg-slate-900 text-white">
                    {/* Sidebar */}
                    <Sidebar className="w-72 !bg-slate-800 border-r border-slate-700 flex flex-col mr-4">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h2 className="text-lg font-semibold">OpenAPI Specs</h2>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={createNewSpec}
                                            className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
                                        >
                                            <Plus size={18} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Create New Spec</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        <div className="p-3">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search specs..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 bg-slate-700 border-slate-600 text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto">
                            {sortedSpecs.length > 0 ? (
                                <ul className="p-2">
                                    {sortedSpecs.map((spec) => (
                                        <li
                                            key={spec.id}
                                            className={`mb-2 p-3 rounded-md transition-colors ${currentSpec?.id === spec.id
                                                ? "bg-blue-700 text-white"
                                                : "hover:bg-slate-700"
                                                }`}
                                        >
                                            <div onClick={() => loadSpec(spec)} className="cursor-pointer">
                                                <div className="flex justify-between items-center mb-1">
                                                    <div className="font-medium truncate" title={spec.name}>
                                                        {spec.favorite && "★ "}{spec.name}
                                                    </div>
                                                    <div className="flex space-x-1">
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 text-slate-300 hover:text-white"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleFavorite(spec.id);
                                                                        }}
                                                                    >
                                                                        {spec.favorite ? (
                                                                            <span className="text-yellow-400">★</span>
                                                                        ) : (
                                                                            <span className="text-slate-400">☆</span>
                                                                        )}
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>{spec.favorite ? "Remove from favorites" : "Add to favorites"}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>

                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 text-slate-300 hover:text-white"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleCopy(spec.id);
                                                                        }}
                                                                    >
                                                                        {copiedId === spec.id ? (
                                                                            <Check size={14} className="text-green-400" />
                                                                        ) : (
                                                                            <Copy size={14} />
                                                                        )}
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>Copy to clipboard</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>

                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 text-slate-300 hover:text-red-400"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDelete(spec.id);
                                                                        }}
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>Delete spec</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between text-xs text-slate-400">
                                                    <span>v{spec.version}</span>
                                                    <div className="flex items-center space-x-2">
                                                        <span className="uppercase">{spec.format}</span>
                                                        <span>{new Date(spec.lastModified).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                {spec.tags && spec.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {spec.tags.map(tag => (
                                                            <span key={tag} className="px-1.5 py-0.5 bg-slate-600 rounded-md text-xs">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="p-4 text-slate-400 text-center flex flex-col items-center">
                                    <FileText size={48} className="mb-2 text-slate-500" />
                                    <p className="mb-1">No specs found</p>
                                    <p className="text-xs">
                                        {searchTerm ? "Try a different search term" : "Create or import a spec to get started"}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-700">
                            <Tabs defaultValue="import">
                                <TabsList className="grid grid-cols-2 mb-2 bg-slate-700">
                                    <TabsTrigger value="import">Import</TabsTrigger>
                                    <TabsTrigger value="export" disabled={!currentSpec}>Export</TabsTrigger>
                                </TabsList>

                                <TabsContent value="import">
                                    <div className="space-y-2">
                                        <Button
                                            onClick={() => setIsImporting(true)}
                                            className="w-full bg-blue-600 hover:bg-blue-700"
                                        >
                                            <FileUp size={16} className="mr-2" />
                                            Import from Text
                                        </Button>
                                        <Button
                                            onClick={handleFileImport}
                                            className="w-full bg-purple-600 hover:bg-purple-700"
                                        >
                                            <FileUp size={16} className="mr-2" />
                                            Import from File
                                        </Button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".json,.yaml,.yml"
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="export">
                                    <Button
                                        onClick={handleExport}
                                        disabled={!currentSpec}
                                        className="w-full bg-green-600 hover:bg-green-700"
                                    >
                                        <FileDown size={16} className="mr-2" />
                                        Export as {currentSpec?.format.toUpperCase()}
                                    </Button>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </Sidebar>

                    {/* Main Editor Section */}
                    <div className="flex-1 flex flex-col p-4 overflow-hidden ml-8">
                        <div className="mb-4 flex justify-between items-center">
                            <div className="flex items-center space-x-3 w-1/2">
                                <Input
                                    type="text"
                                    placeholder="Spec Title"
                                    className="bg-slate-700 border-slate-600 font-medium"
                                    value={specTitle}
                                    onChange={(e) => {
                                        setSpecTitle(e.target.value);
                                        setAutoDetectTitle(false);
                                    }}
                                />
                                <Input
                                    type="text"
                                    placeholder="Version"
                                    className="bg-slate-700 border-slate-600 w-24 text-center"
                                    value={specVersion}
                                    onChange={(e) => setSpecVersion(e.target.value)}
                                />
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setAutoDetectTitle(!autoDetectTitle)}
                                                className={`h-9 w-9 ${autoDetectTitle ? "border-green-500 text-green-500" : "border-slate-600 text-slate-400"
                                                    }`}
                                            >
                                                <RefreshCw size={16} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{autoDetectTitle ? "Auto-detect title from spec is ON" : "Auto-detect title from spec is OFF"}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>

                            <div className="flex items-center space-x-3">
                                <div className="flex items-center bg-slate-700 rounded-md">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`rounded-r-none ${specFormat === "yaml" ? "bg-blue-600 text-white" : "text-slate-300"
                                            }`}
                                        onClick={() => handleFormatToggle("yaml")}
                                    >
                                        YAML
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`rounded-l-none ${specFormat === "json" ? "bg-blue-600 text-white" : "text-slate-300"
                                            }`}
                                        onClick={() => handleFormatToggle("json")}
                                    >
                                        JSON
                                    </Button>
                                </div>

                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div id="saved-message" className="text-green-400 text-sm opacity-0 transition-opacity duration-300">
                                                Saved successfully!
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Changes saved to local storage</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <Button
                                    onClick={saveSpec}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    <Save size={16} className="mr-2" />
                                    Save
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden rounded-lg border border-slate-700 mb-2">
                            <Editor
                                height="100%"
                                width="100%"
                                theme="vs-dark"
                                language={specFormat === "yaml" ? "yaml" : "json"}
                                value={editorValue}
                                onChange={handleEditorChange}
                                onMount={(editor) => {
                                    editorRef.current = editor;
                                }}
                                options={{
                                    minimap: { enabled: true },
                                    wordWrap: "on",
                                    lineNumbers: "on",
                                    folding: true,
                                    renderWhitespace: "all",
                                    tabSize: 2,
                                    automaticLayout: true,
                                }}
                            />
                        </div>

                        <div className="flex justify-between items-center text-xs text-slate-400">
                            <div>
                                {editorValue && (
                                    <>
                                        {formatFileSize(new Blob([editorValue]).size)} •
                                        {editorValue.split("\n").length} lines
                                    </>
                                )}
                            </div>
                            <div>
                                {!isSaved && <span className="text-yellow-400">Unsaved changes</span>}
                            </div>
                        </div>

                        {error && (
                            <Alert variant="destructive" className="mt-2 border-red-800 bg-red-900/50 text-red-200">
                                <AlertDescription>
                                    <div className="flex items-start space-x-2">
                                        <X size={18} className="mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                </div>

                {/* Delete confirmation dialog */}
                <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <DialogContent className="bg-slate-800 text-white border-slate-700">
                        <DialogHeader>
                            <DialogTitle>Confirm Deletion</DialogTitle>
                            <DialogDescription className="text-slate-300">
                                Are you sure you want to delete this spec? This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setShowDeleteDialog(false)}
                                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={confirmDelete}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                Delete
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Import dialog */}
                <Dialog open={isImporting} onOpenChange={setIsImporting}>
                    <DialogContent className="bg-slate-800 text-white border-slate-700 max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Import OpenAPI Specification</DialogTitle>
                            <DialogDescription className="text-slate-300">
                                Paste your OpenAPI spec in YAML or JSON format. The format will be auto-detected.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <Input
                                placeholder="Spec Name (optional)"
                                value={importName}
                                onChange={(e) => setImportName(e.target.value)}
                                className="bg-slate-700 border-slate-600"
                            />

                            <textarea
                                placeholder="Paste your OpenAPI spec here..."
                                value={importValue}
                                onChange={(e) => setImportValue(e.target.value)}
                                className="w-full h-64 p-3 text-sm font-mono bg-slate-700 border border-slate-600 rounded-md text-white"
                            />

                            <div className="text-xs text-slate-400">
                                The spec title, version, and format will be automatically detected if not specified.
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsImporting(false)}>Cancel</Button>
                            <Button onClick={handleImport}>Import</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </SidebarProvider>
        </>
    );
};

export default EditorPage;
