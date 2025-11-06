import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Loader2, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UninstallRequest } from "@shared/schema";

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

export default function RequestsTable() {
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
