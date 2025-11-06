import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function UninstallTester() {
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
