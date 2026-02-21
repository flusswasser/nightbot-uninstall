import { useState, useMemo } from "react";
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
import { Loader2, Trash2, Copy, Check, Terminal, Skull, Trophy, ListOrdered, Settings2, Hash, Gamepad2, PieChart } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UninstallRequest, Boss, Player as Channel, Game } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PieChart as ReChartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReChartsTooltip, Legend } from 'recharts';

const CHART_COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', 
  '#FF9F40', '#FFCD56', '#C9CBCF', '#4BC0C0', '#36A2EB'
];

// --- API Info Component ---
function ApiInfo({ type, channel }: { type: 'uninstall' | 'death', channel: Channel }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const getCommands = () => {
    const channelParam = `&channel=$(channel)`;
    if (type === 'uninstall') {
      const apiUrl = `${window.location.origin}/api/uninstall?program=$(query)${channelParam}`;
      return [
        { 
          name: '!uninstall', 
          url: apiUrl, 
          description: "Track program uninstalls",
          syntax: "!uninstall <program name>" 
        }
      ];
    } else {
      return [
        { 
          name: '!newgame', 
          url: `${window.location.origin}/api/newgame?game=$(query)${channelParam}`, 
          description: "Set active game",
          syntax: "!newgame <game name>" 
        },
        { 
          name: '!death', 
          url: `${window.location.origin}/api/death?boss=$(query)${channelParam}`, 
          description: "Add death to boss",
          syntax: "!death <boss name>" 
        },
        { 
          name: '!deaths', 
          url: `${window.location.origin}/api/deaths?boss=$(query)${channelParam}`, 
          description: "Show deaths stats",
          syntax: "!deaths [boss name]" 
        },
        { 
          name: '!beaten', 
          url: `${window.location.origin}/api/beaten?boss=$(query)${channelParam}`, 
          description: "Mark boss as beaten",
          syntax: "!beaten [boss name]" 
        },
        { 
          name: '!totaldeaths', 
          url: `${window.location.origin}/api/total-deaths?game=$(query)&channel=$(channel)`, 
          description: "Total deaths in game",
          syntax: "!totaldeaths [game name]" 
        },
        { 
          name: '!setdeaths', 
          url: `${window.location.origin}/api/setdeaths?boss=$(1)&count=$(2)${channelParam}`, 
          description: "Manually set deaths",
          syntax: "!setdeaths <boss name> <count>" 
        },
        { 
          name: '!gamebeaten', 
          url: `${window.location.origin}/api/gamebeaten?channel=$(channel)`, 
          description: "Mark game as beaten",
          syntax: "!gamebeaten" 
        },
        { 
          name: '!lifetimedeaths', 
          url: `${window.location.origin}/api/lifetime-deaths?channel=$(channel)`, 
          description: "Total deaths across all games",
          syntax: "!lifetimedeaths" 
        }
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
    <Card>
      <CardHeader>
        <CardTitle>{type === 'uninstall' ? 'Uninstall Tracker' : 'Death Counter'} Nightbot Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {getCommands().map((cmd) => (
          <div key={cmd.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-bold">{cmd.name}</p>
                {"syntax" in cmd && <p className="text-[10px] font-mono text-primary bg-primary/5 px-2 py-0.5 rounded-sm inline-block">{cmd.syntax}</p>}
              </div>
              <p className="text-xs text-muted-foreground">{cmd.description}</p>
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

// --- Channel Settings ---
function ChannelSettings({ channel }: { channel: Channel }) {
  const [name, setName] = useState(channel.name);
  const { toast } = useToast();
  
  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      return await apiRequest('POST', `/api/channels/${channel.id}`, { name: newName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
      toast({ title: "Updated", description: "Channel display name updated" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/channels/${channel.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
      toast({ title: "Channel Deleted", description: "All data for this channel has been removed" });
    }
  });

  const resetAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/channels/${channel.id}/reset-all`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/games'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bosses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lifetime-data'] });
      toast({ title: "Reset complete", description: `All games and deaths for ${channel.name} have been cleared` });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {channel.id} Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tighter">Display Name</label>
          <div className="flex gap-2">
            <Input size={1} className="h-8 text-xs" value={name} onChange={e => setName(e.target.value)} placeholder="Display name..." />
            <Button size="sm" onClick={() => updateMutation.mutate(name)} disabled={updateMutation.isPending}>
              Update
            </Button>
          </div>
        </div>
        
        <div className="pt-3 border-t grid grid-cols-2 gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full text-[10px]" disabled={resetAllMutation.isPending}>
                Reset All Games
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset All Games?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently clear ALL games and death records for "{channel.id}".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => resetAllMutation.mutate()} className="bg-destructive text-destructive-foreground">
                  Reset Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-full text-[10px]" disabled={deleteMutation.isPending}>
                Delete Acc
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{channel.id}" and ALL its data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground">
                  Delete
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
function DeathCounter({ channel }: { channel: Channel }) {
  const { data: games } = useQuery<Game[]>({ 
    queryKey: ['/api/games', { channel: channel.id }],
    queryFn: () => fetch(`/api/games?channel=${channel.id}`).then(res => res.json())
  });

  const activeGame = games?.find(g => g.id === channel.activeGameId);
  const [selectedGameId, setSelectedGameId] = useState<string>("lifetime");
  const displayGameId = selectedGameId;

  const { data: bosses, isLoading } = useQuery<Boss[]>({ 
    queryKey: ['/api/bosses', { channel: channel.id, game: displayGameId }],
    queryFn: () => fetch(`/api/bosses?channel=${channel.id}&game=${displayGameId}`).then(res => res.json()),
    enabled: !!displayGameId && displayGameId !== "lifetime"
  });

  // Fetch all deaths for lifetime view
  const { data: allGamesBosses } = useQuery<Record<string, Boss[]>>({
    queryKey: ['/api/lifetime-data', { channel: channel.id }],
    queryFn: async () => {
      const gRes = await fetch(`/api/games?channel=${channel.id}`);
      const gList: Game[] = await gRes.json();
      const results: Record<string, Boss[]> = {};
      for (const g of gList) {
        const bRes = await fetch(`/api/bosses?channel=${channel.id}&game=${g.id}`);
        results[g.id] = await bRes.json();
      }
      return results;
    },
    enabled: displayGameId === "lifetime"
  });

  const lifetimeData = useMemo(() => {
    if (!allGamesBosses || !games) return [];
    return games.map((g, idx) => ({
      id: g.id,
      name: g.name,
      deaths: allGamesBosses[g.id]?.reduce((sum, b) => sum + b.deathCount, 0) || 0,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    })).sort((a, b) => b.deaths - a.deaths);
  }, [allGamesBosses, games]);

  const totalLifetimeDeaths = lifetimeData.reduce((sum, d) => sum + d.deaths, 0);
  const averageDeathsPerGame = lifetimeData.length > 0 ? (totalLifetimeDeaths / lifetimeData.length).toFixed(1) : 0;
  const mostDeadlyGame = lifetimeData.length > 0 ? lifetimeData[0] : null;

  const deleteGameMutation = useMutation({
    mutationFn: async (gameId: string) => {
      await apiRequest('DELETE', `/api/games/${gameId}?channel=${channel.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/games'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lifetime-data'] });
      if (selectedGameId !== "lifetime") setSelectedGameId("lifetime");
    }
  });

  const deleteBossMutation = useMutation({
    mutationFn: async (bossName: string) => {
      await apiRequest('DELETE', `/api/bosses/${encodeURIComponent(bossName)}?channel=${channel.id}&game=${displayGameId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bosses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lifetime-data'] });
      toast({ title: "Boss Deleted", description: "Boss record has been removed." });
    }
  });

  const gameTotalDeaths = bosses?.reduce((acc, b) => acc + b.deathCount, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <ApiInfo type="death" channel={channel} />
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
             <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    Active Game
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/10">
                    <div className="font-bold text-lg">{activeGame?.name || "None"}</div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-widest">{activeGame ? "Tracking" : "Awaiting !newgame"}</Badge>
                  </div>
                </CardContent>
             </Card>
             <ChannelSettings channel={channel} />
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Current Status</CardTitle>
              <CardDescription>Active boss tracking for {activeGame?.name || "N/A"}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && displayGameId === activeGame?.id ? <Loader2 className="animate-spin" /> : (
                <div className="space-y-4">
                  {bosses?.filter(b => b.gameId === activeGame?.id && !b.isBeaten).map(boss => (
                    <div key={boss.id} className="flex items-center justify-between p-4 bg-muted rounded-lg border-l-4 border-l-primary">
                      <div>
                        <p className="text-lg font-bold">{boss.name}</p>
                        <p className="text-sm text-muted-foreground uppercase tracking-widest text-[10px]">Currently Fighting</p>
                      </div>
                      <div className="text-3xl font-black text-primary">{boss.deathCount}</div>
                    </div>
                  ))}
                  {(!activeGame || !bosses?.some(b => b.gameId === activeGame?.id && !b.isBeaten)) && (
                    <div className="text-center py-8 text-muted-foreground italic text-sm">
                      {activeGame ? "No active boss. Use !death <name> in chat!" : "Set a game using !newgame <name> first!"}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between mb-4">
             <CardTitle>Game History</CardTitle>
          </div>
          <Tabs value={displayGameId} onValueChange={setSelectedGameId} className="w-full">
            <div className="overflow-x-auto pb-2">
               <TabsList className="bg-muted/30 p-1 rounded-lg inline-flex">
                 <TabsTrigger value="lifetime" className="text-xs font-bold px-4">
                    Lifetime Deaths
                 </TabsTrigger>
                 {games?.map(game => (
                   <TabsTrigger key={game.id} value={game.id} className="text-xs font-bold px-4">
                     {game.name}
                   </TabsTrigger>
                 ))}
               </TabsList>
            </div>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-6">
          {displayGameId === "lifetime" ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Lifetime Deaths</p>
                  <p className="text-4xl font-black text-primary">{totalLifetimeDeaths}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Avg Deaths / Game</p>
                  <p className="text-4xl font-black">{averageDeathsPerGame}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Most Deadly</p>
                  <p className="text-xl font-black truncate">{mostDeadlyGame?.name || "None"}</p>
                  <p className="text-xs font-bold text-muted-foreground">{mostDeadlyGame?.deaths || 0} deaths</p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-1 space-y-4 w-full">
                  <div className="space-y-2">
                    {lifetimeData.map((d) => (
                      <div key={d.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors group">
                        <div className="flex items-center gap-3">
                           <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                           <button 
                             onClick={() => setSelectedGameId(d.id)}
                             className="font-bold text-sm hover:text-primary transition-colors text-left"
                           >
                             {d.name}
                           </button>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-black text-lg">{d.deaths}</span>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {d.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove this game and all its death records.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteGameMutation.mutate(d.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                    {lifetimeData.length === 0 && (
                      <p className="text-center py-8 text-muted-foreground italic text-sm">No games tracked yet.</p>
                    )}
                  </div>
                </div>
                {lifetimeData.length > 0 && (
                  <div className="w-full md:w-[300px] h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ReChartsPieChart>
                        <Pie
                          data={lifetimeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="deaths"
                        >
                          {lifetimeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <ReChartsTooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                          itemStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                      </ReChartsPieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 p-4 bg-muted/50 rounded-xl flex items-center justify-between border border-border/50">
                 <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Total Game Deaths</p>
                    <p className="text-2xl font-black">{gameTotalDeaths}</p>
                 </div>
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   className="text-muted-foreground hover:text-destructive gap-2"
                   onClick={() => deleteGameMutation.mutate(displayGameId)}
                 >
                   <Trash2 className="h-4 w-4" /> Delete Game
                 </Button>
              </div>
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
                    <TableRow key={boss.id} className={`group ${!boss.isBeaten && boss.deathCount > 10 ? 'bg-destructive/5' : ''}`}>
                      <TableCell className="font-bold">
                        <div className="flex items-center gap-2">
                          {boss.name}
                          {!boss.isBeaten && boss.deathCount >= 20 && (
                            <Badge variant="destructive" className="h-4 text-[8px] px-1 uppercase animate-pulse">Roadblock</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {boss.isBeaten ? (
                          <span className="flex items-center gap-1 text-green-500 font-bold uppercase text-[10px] tracking-widest">
                            Beaten
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 font-bold uppercase text-[10px] tracking-widest">
                            Active
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-4">
                          <span className="font-black text-lg">{boss.deathCount}</span>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {boss.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove this boss record from {games?.find(g => g.id === displayGameId)?.name}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteBossMutation.mutate(boss.name)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!bosses || bosses.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground italic text-sm">
                        No data for this game.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Uninstall Tracker Components ---
function UninstallTracker({ channel }: { channel: Channel }) {
  const { data: requests, isLoading } = useQuery<UninstallRequest[]>({ 
    queryKey: ['/api/uninstall/all', { channel: channel.id }],
    queryFn: () => fetch(`/api/uninstall/all?channel=${channel.id}`).then(res => res.json())
  });

  const [testProgram, setTestProgram] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const testMutation = useMutation({
    mutationFn: async (program: string) => {
      const res = await fetch(`/api/uninstall?program=${encodeURIComponent(program)}&channel=${channel.id}`);
      return res.text();
    },
    onSuccess: (data) => {
      setTestResponse(data);
      queryClient.invalidateQueries({ queryKey: ['/api/uninstall/all', { channel: channel.id }] });
    }
  });

  return (
    <div className="space-y-6">
      <ApiInfo type="uninstall" channel={channel} />
      
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Test !uninstall</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); testMutation.mutate(testProgram); }}>
              <Input placeholder="Program name..." value={testProgram} onChange={e => setTestProgram(e.target.value)} />
              <Button type="submit" disabled={testMutation.isPending}>Test</Button>
            </form>
            {testResponse && <div className="p-3 bg-muted rounded font-mono text-sm">{testResponse}</div>}
          </CardContent>
        </Card>

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
                  {(!requests || requests.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground italic text-sm">
                        No requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: channels, isLoading } = useQuery<Channel[]>({ queryKey: ['/api/channels'] });
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");

  const activeChannel = channels?.find(c => c.id === selectedChannelId) || channels?.find(c => c.isDefault) || channels?.[0];

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 font-sans">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-6 border-b pb-8">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/20">
              <Terminal className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter uppercase italic leading-none">Nightbot Tracker</h1>
              <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-[0.3em] mt-1 opacity-60">Twitch Command Center</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-muted/50 p-2 pl-4 rounded-xl border border-border/50 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Select Channel</span>
              </div>
              <Select value={activeChannel?.id} onValueChange={setSelectedChannelId}>
                <SelectTrigger className="w-[220px] border-0 bg-background/50 shadow-sm focus:ring-0 font-bold">
                  <SelectValue placeholder="Select Channel" />
                </SelectTrigger>
                <SelectContent className="font-bold">
                  {channels?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.id} ({c.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Initializing Data Stream...</p>
          </div>
        ) : activeChannel ? (
          <Tabs defaultValue="deaths" className="space-y-8">
            <div className="flex justify-center">
               <TabsList className="grid w-full grid-cols-2 max-w-md p-1 bg-muted/50 rounded-xl border">
                <TabsTrigger value="deaths" className="flex items-center gap-2 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold transition-all">
                  Death Counter
                </TabsTrigger>
                <TabsTrigger value="uninstall" className="flex items-center gap-2 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold transition-all">
                  Uninstall Tracker
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="deaths" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <DeathCounter channel={activeChannel} />
            </TabsContent>
            <TabsContent value="uninstall" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <UninstallTracker channel={activeChannel} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-32 bg-muted/20 rounded-3xl border-2 border-dashed border-border/50 backdrop-blur-sm animate-in zoom-in-95 duration-500">
            <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
               <Terminal className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight mb-2">No data channels detected</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-8 font-medium">Use any command in your Twitch chat (e.g., <code className="text-primary font-bold">!uninstall test</code>) to register your channel automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}
