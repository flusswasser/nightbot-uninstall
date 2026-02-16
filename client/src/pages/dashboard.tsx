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
import { Loader2, Trash2, Copy, Check, Terminal, Skull, Trophy, ListOrdered, User, Settings2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UninstallRequest, Boss, Player } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// --- API Info Component ---
function ApiInfo({ type, player }: { type: 'uninstall' | 'death', player?: Player }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const getCommands = () => {
    if (type === 'uninstall') {
      const apiUrl = `${window.location.origin}/api/uninstall?program=$(query)`;
      return [
        { name: '!uninstall', url: apiUrl, description: "Track program uninstalls" }
      ];
    } else {
      const playerParam = player ? `&player=${player.id}` : "";
      return [
        { name: '!death', url: `${window.location.origin}/api/death?boss=$(query)${playerParam}`, description: "Add death to boss" },
        { name: '!deaths', url: `${window.location.origin}/api/deaths?boss=$(query)${playerParam}`, description: "Show deaths stats" },
        { name: '!beaten', url: `${window.location.origin}/api/beaten?boss=$(query)${playerParam}`, description: "Mark boss as beaten" },
        { name: '!totaldeaths', url: `${window.location.origin}/api/total-deaths?${playerParam.replace("&", "")}`, description: "Total deaths" },
        { name: '!setdeaths', url: `${window.location.origin}/api/setdeaths?boss=$(1)&count=$(2)${playerParam}`, description: "Manually set deaths" }
      ];
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied!", description: "Command copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card data-testid={`card-api-info-${type}`}>
      <CardHeader>
        <CardTitle>{type === 'uninstall' ? 'Uninstall Tracker' : 'Death Counter'} Nightbot Setup</CardTitle>
        <CardDescription>
          Commands to add to your Nightbot
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {getCommands().map((cmd) => (
          <div key={cmd.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">{cmd.name}</p>
              {"description" in cmd && <p className="text-xs text-muted-foreground">{cmd.description}</p>}
            </div>
            <div className="bg-muted p-2 rounded-md flex items-center gap-2">
              <code className="text-xs font-mono break-all flex-1">
                $(urlfetch {cmd.url})
              </code>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(`$(urlfetch ${cmd.url})`)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// --- Player Settings ---
function PlayerSettings({ player }: { player: Player }) {
  const [name, setName] = useState(player.name);
  const { toast } = useToast();
  
  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      return await apiRequest('POST', `/api/players/${player.id}`, { name: newName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      toast({ title: "Updated", description: "Player name updated" });
    }
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/players/${player.id}/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bosses'] });
      toast({ title: "Reset complete", description: `All deaths for ${player.name} have been cleared` });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" /> Settings for {player.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Player name..." />
          <Button onClick={() => updateMutation.mutate(name)} disabled={updateMutation.isPending}>
            Update Name
          </Button>
        </div>
        
        <div className="pt-4 border-t">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" disabled={resetMutation.isPending}>
                <Trash2 className="mr-2 h-4 w-4" /> Reset All Deaths for {player.name}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all death records for {player.name}. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => resetMutation.mutate()} className="bg-destructive text-destructive-foreground">
                  Reset Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Death Counter Dashboard ---
function DeathCounter({ player }: { player: Player }) {
  const { data: bosses, isLoading } = useQuery<Boss[]>({ 
    queryKey: ['/api/bosses', { player: player.id }],
    queryFn: () => fetch(`/api/bosses?player=${player.id}`).then(res => res.json())
  });
  
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <ApiInfo type="death" player={player} />
        <div className="space-y-6">
          <PlayerSettings player={player} />
          <Card>
            <CardHeader>
              <CardTitle>Current Status</CardTitle>
              <CardDescription>Active boss tracking for {player.name}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Loader2 className="animate-spin" /> : (
                <div className="space-y-4">
                  {bosses?.filter(b => !b.isBeaten).map(boss => (
                    <div key={boss.id} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="text-lg font-bold">{boss.name}</p>
                        <p className="text-sm text-muted-foreground">Currently Fighting</p>
                      </div>
                      <div className="text-3xl font-black text-primary">{boss.deathCount}</div>
                    </div>
                  ))}
                  {!bosses?.some(b => !b.isBeaten) && (
                    <div className="text-center py-8 text-muted-foreground italic">
                      No active boss. Use !death &lt;name&gt; in chat to start one!
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hall of Shame (Boss History)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Boss Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Deaths</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bosses?.sort((a,b) => b.deathCount - a.deathCount).map((boss) => (
                <TableRow key={boss.id}>
                  <TableCell className="font-medium">{boss.name}</TableCell>
                  <TableCell>
                    {boss.isBeaten ? (
                      <span className="flex items-center gap-1 text-green-500 font-bold">
                        <Trophy className="h-4 w-4" /> Beaten
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-500">
                        <Skull className="h-4 w-4" /> Active
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-lg">{boss.deathCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Uninstall Tracker Components ---
function UninstallTracker() {
  return (
    <div className="space-y-6">
      <ApiInfo type="uninstall" />
      <UninstallTester />
      <RequestsTable />
    </div>
  );
}

function UninstallTester() {
  const [program, setProgram] = useState("");
  const [response, setResponse] = useState("");

  const mutation = useMutation({
    mutationFn: async (programName: string) => {
      const res = await fetch(`/api/uninstall?program=${encodeURIComponent(programName)}`);
      if (!res.ok) throw new Error("Failed");
      return res.text();
    },
    onSuccess: (data) => {
      setResponse(data);
      queryClient.invalidateQueries({ queryKey: ['/api/uninstall/all'] });
    }
  });

  return (
    <Card>
      <CardHeader><CardTitle>Test !uninstall</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); mutation.mutate(program); }}>
          <Input placeholder="Program name..." value={program} onChange={e => setProgram(e.target.value)} />
          <Button type="submit" disabled={mutation.isPending}>Test</Button>
        </form>
        {response && <div className="p-3 bg-muted rounded font-mono text-sm">{response}</div>}
      </CardContent>
    </Card>
  );
}

function RequestsTable() {
  const { data: requests, isLoading } = useQuery<UninstallRequest[]>({ queryKey: ['/api/uninstall/all'] });
  return (
    <Card>
      <CardHeader><CardTitle>Leaderboard</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Program</TableHead>
                <TableHead className="text-right">Requests</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests?.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{r.programName}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: players } = useQuery<Player[]>({ queryKey: ['/api/players'] });
  const defaultPlayer = players?.find(p => p.isDefault) || players?.[0];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase">Community Tracker</h1>
              <p className="text-muted-foreground text-sm uppercase tracking-widest">Twitch Tools</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="deaths" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="deaths" className="flex items-center gap-2">
              <Skull className="h-4 w-4" /> Death Counter
            </TabsTrigger>
            <TabsTrigger value="uninstall" className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" /> Uninstall Tracker
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="deaths">
            {defaultPlayer ? <DeathCounter player={defaultPlayer} /> : <Loader2 className="animate-spin mx-auto" />}
          </TabsContent>
          <TabsContent value="uninstall"><UninstallTracker /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
