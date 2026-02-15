import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Trash2, Copy, Check, Terminal, TrendingUp } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UninstallRequest } from "@shared/schema";

// --- API Info Component ---
function ApiInfo() {
  const [copied, setCopied] = useState(false);
  const apiUrl = `${window.location.origin}/api/uninstall?program=$(query)`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card data-testid="card-api-info">
      <CardHeader>
        <CardTitle>Nightbot Setup Instructions</CardTitle>
        <CardDescription>
          Use this API endpoint in your Nightbot custom command
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2">Command Name:</p>
          <code className="block bg-muted p-3 rounded-md text-sm font-mono">
            !uninstall
          </code>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Command Response:</p>
          <div className="bg-muted p-3 rounded-md">
            <code className="text-sm font-mono break-all">
              $(urlfetch {apiUrl})
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="ml-2"
              onClick={copyToClipboard}
              data-testid="button-copy"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Usage in Twitch chat:</strong> !uninstall Windows Vista
          </p>
          <p>
            <strong>Response:</strong> Chat has requested to uninstall Windows Vista 5 times. Go ahead and do it already!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Uninstall Tester Component ---
function UninstallTester() {
  const [program, setProgram] = useState("");
  const [response, setResponse] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (programName: string) => {
      const res = await fetch(`/api/uninstall?program=${encodeURIComponent(programName)}`);
      if (!res.ok) throw new Error("Failed to process request");
      return res.text();
    },
    onSuccess: (data) => {
      setResponse(data);
      queryClient.invalidateQueries({ queryKey: ['/api/uninstall/all'] });
      toast({
        title: "Success",
        description: "Uninstall request tracked",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process request",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (program.trim()) {
      mutation.mutate(program);
    }
  };

  return (
    <Card data-testid="card-tester">
      <CardHeader>
        <CardTitle>Test Nightbot Command</CardTitle>
        <CardDescription>
          Simulate the !uninstall command by entering a program name
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="e.g., Windows Vista"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            data-testid="input-program"
            disabled={mutation.isPending}
          />
          <Button 
            type="submit" 
            disabled={!program.trim() || mutation.isPending}
            data-testid="button-submit"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test
          </Button>
        </form>
        {response && (
          <div className="rounded-md bg-muted p-4" data-testid="text-response">
            <p className="text-sm font-mono">{response}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Requests Table Row Component ---
function RequestRow({ request, index }: { request: UninstallRequest; index: number }) {
  const { toast } = useToast();
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/uninstall/${encodeURIComponent(request.programName)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uninstall/all'] });
      toast({
        title: "Success",
        description: `Deleted request for ${request.programName}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete request",
        variant: "destructive",
      });
    },
  });

  return (
    <TableRow data-testid={`row-request-${index}`}>
      <TableCell className="font-medium text-muted-foreground">
        {index + 1}
      </TableCell>
      <TableCell className="font-medium" data-testid={`text-program-${index}`}>
        {request.programName}
      </TableCell>
      <TableCell className="text-right font-bold" data-testid={`text-count-${index}`}>
        {request.count}
      </TableCell>
      <TableCell>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid={`button-delete-${index}`}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this request?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the uninstall request for "{request.programName}". This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid={`button-cancel-delete-${index}`}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deleteMutation.mutate()}
                data-testid={`button-confirm-delete-${index}`}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

// --- Requests Table Component ---
function RequestsTable() {
  const { toast } = useToast();
  const { data: requests, isLoading } = useQuery<UninstallRequest[]>({
    queryKey: ['/api/uninstall/all'],
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', '/api/uninstall/reset');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uninstall/all'] });
      toast({
        title: "Success",
        description: "All uninstall requests have been reset",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reset requests",
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid="card-requests">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Uninstall Requests Leaderboard</CardTitle>
            <CardDescription>
              Programs sorted by number of uninstall requests
            </CardDescription>
          </div>
          {requests && requests.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  data-testid="button-reset"
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Reset All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all uninstall request data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel">Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => resetMutation.mutate()}
                    data-testid="button-confirm"
                  >
                    Reset All Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : requests && requests.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Program Name</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request, index) => (
                <RequestRow 
                  key={request.id} 
                  request={request} 
                  index={index}
                />
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No requests yet. Try testing the command above!
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Main Dashboard Page ---
export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Terminal className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-title">
              Nightbot Uninstall Tracker
            </h1>
          </div>
          <p className="text-muted-foreground">
            Track and display community uninstall requests for your Twitch chat
          </p>
        </div>

        <div className="grid gap-6">
          <ApiInfo />
          <UninstallTester />
          <RequestsTable />
        </div>
      </div>
    </div>
  );
}
