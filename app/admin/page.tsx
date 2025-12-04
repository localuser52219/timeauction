'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase'

export default function AdminPage() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // 遊戲資料 State
  const [players, setPlayers] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [gameState, setGameState] = useState<any>(null)

  // 防止重複結算的鎖
  const isSettlingRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) initDashboard()
    })
  }, [])

  // [新增功能] 自動結算監聽器
  // 當 Bids 變動或 Players 變動時，檢查是否所有人已出價
  useEffect(() => {
    if (!gameState || gameState.game_status !== 'bidding' || players.length === 0) return

    // 找出本局的有效出價 (包含 Fold 的)
    const currentRoundBids = bids.filter(b => b.round_number === gameState.current_round)
    
    // 如果「出價數」等於「玩家總數」，且目前沒有正在結算
    if (currentRoundBids.length === players.length && !isSettlingRef.current) {
        console.log("All players have bid. Auto settling...")
        settleRound()
    }
  }, [bids, players, gameState]) // 監聽這些變數

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
    else {
      setSession(data.session)
      initDashboard()
    }
    setLoading(false)
  }

  const initDashboard = () => {
    fetchData()
    subscribeRealtime()
  }

  const subscribeRealtime = () => {
    supabase.channel('admin_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_players' }, fetchPlayers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_bids' }, fetchBids)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_rooms' }, (payload) => setGameState(payload.new))
      .subscribe()
  }

  const fetchData = async () => {
    fetchPlayers()
    fetchBids()
    const { data } = await supabase.from('ta_rooms').select('*').single()
    if (data) setGameState(data)
  }

  const fetchPlayers = async () => {
    const { data } = await supabase.from('ta_players').select('*').order('tokens', { ascending: false }).order('total_time_left', { ascending: true })
    setPlayers(data || [])
  }
  
  const fetchBids = async () => {
    if(!gameState) return
    const { data } = await supabase.from('ta_bids').select('*')
    setBids(data || [])
  }

  const nextRound = async () => {
    if (!gameState) return
    isSettlingRef.current = false // 解鎖
    setBids([]) 
    await supabase.from('ta_rooms').update({
      current_round: gameState.current_round + 1,
      game_status: 'bidding'
    }).eq('id', gameState.id)
  }

  const settleRound = async () => {
    if (!gameState || isSettlingRef.current) return
    isSettlingRef.current = true // 上鎖，防止重複執行

    // 1. 再次從 DB 確認最新出價 (防止 State 延遲)
    const { data: currentBids } = await supabase.from('ta_bids').select('*').eq('round_number', gameState.current_round)
    
    if (!currentBids || currentBids.length === 0) {
      await supabase.from('ta_rooms').update({ game_status: 'revealed' }).eq('id', gameState.id)
      return
    }

    const validBids = currentBids.filter(b => !b.is_fold)
    let winnerId = null
    
    if (validBids.length > 0) {
      const maxTime = Math.max(...validBids.map(b => b.bid_seconds))
      const winners = validBids.filter(b => b.bid_seconds === maxTime)
      if (winners.length === 1) winnerId = winners[0].player_id
    }

    // 批量更新邏輯
    for (let bid of currentBids) {
        if (bid.bid_seconds > 0) {
             const p = players.find(x => x.id === bid.player_id)
             if (p) {
                 await supabase.from('ta_players').update({ 
                     total_time_left: p.total_time_left - bid.bid_seconds 
                 }).eq('id', p.id)
             }
        }
    }

    if (winnerId) {
        const w = players.find(x => x.id === winnerId)
        if(w) await supabase.from('ta_players').update({ tokens: w.tokens + 1 }).eq('id', winnerId)
    }

    await supabase.from('ta_rooms').update({ game_status: 'revealed' }).eq('id', gameState.id)
  }
  
  // [修改功能] 完全重置
  const resetGame = async () => {
      if(!confirm("⚠️ DANGER: FULL RESET?\n這將會刪除所有玩家資料，無法復原！")) return
      
      // 1. 刪除 ta_players 表中的所有資料
      // (因為 SQL 有設定 CASCADE，這會自動刪除 ta_bids 中相關的資料)
      const { error } = await supabase.from('ta_players').delete().neq('id', '00000000-0000-0000-0000-000000000000') // 刪除所有 ID 不為空的人
      
      if (error) {
        console.error(error)
        alert("Reset Failed: " + error.message)
        return
      }

      // 2. 重置房間狀態
      await supabase.from('ta_rooms').update({ current_round: 1, game_status: 'waiting' }).eq('id', gameState.id)
      
      alert("Game Wiped. All players deleted.")
      // 重新拉取一次數據
      fetchPlayers()
      setBids([])
  }

  // --- Render ---

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <form onSubmit={handleLogin} className="p-8 bg-white rounded shadow-md w-96">
          <h2 className="text-2xl mb-4 font-bold">Admin Login</h2>
          <input className="w-full p-2 border mb-4" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="w-full p-2 border mb-4" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button disabled={loading} className="w-full bg-black text-white p-2 rounded">{loading ? 'Loading...' : 'Login'}</button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">🕹️ Game Control</h1>
        <div className="space-x-4">
             <button onClick={resetGame} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-bold">
               ☠️ FULL RESET (Delete All)
             </button>
             <button onClick={() => supabase.auth.signOut().then(()=>setSession(null))} className="px-4 py-2 text-gray-500 underline">Logout</button>
        </div>
      </div>

      {gameState && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           {/* 控制面板 */}
           <div className="md:col-span-1 bg-white p-6 rounded-xl shadow border-2 border-blue-100">
              <div className="text-sm text-gray-500 uppercase">Current Status</div>
              <div className="text-4xl font-bold mb-4">{gameState.game_status}</div>
              <div className="text-xl mb-6">Round: <span className="font-mono font-bold text-blue-600">{gameState.current_round}</span> / 19</div>
              
              <div className="flex flex-col gap-3">
                 <button onClick={nextRound} disabled={gameState.game_status === 'bidding'} className="p-4 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50">
                    1. Start Round
                 </button>
                 
                 {/* 手動結算按鈕 (即使有自動結算，保留這個以防萬一) */}
                 <button onClick={settleRound} disabled={gameState.game_status === 'revealed'} className="p-4 bg-gray-500 text-white rounded font-bold hover:bg-gray-600 disabled:opacity-50 text-sm">
                    Manual Settle (Backup)
                 </button>

                 <div className="mt-4 p-3 bg-yellow-50 text-xs text-yellow-800 rounded">
                    <strong>Auto-Settle Active:</strong> Game will automatically reveal when all {players.length} players have submitted.
                 </div>
              </div>
           </div>

           {/* 監控面板 */}
           <div className="md:col-span-2 bg-white rounded-xl shadow overflow-hidden">
              <div className="p-4 bg-gray-100 font-bold flex justify-between">
                  <span>Players ({players.length})</span>
                  <span>Bids Received: {bids.filter(b => b.round_number === gameState.current_round).length} / {players.length}</span>
              </div>
              <table className="w-full text-left">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="p-4">Player</th>
                    <th className="p-4">Time Left</th>
                    <th className="p-4">Tokens</th>
                    <th className="p-4 bg-yellow-50">Current Bid</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {players.map(p => {
                    const bid = bids.find(b => b.player_id === p.id && b.round_number === gameState.current_round)
                    return (
                      <tr key={p.id}>
                        <td className="p-4 font-medium">{p.name}</td>
                        <td className="p-4 font-mono">{p.total_time_left.toFixed(2)}s</td>
                        <td className="p-4">
                           {[...Array(p.tokens)].map((_,i)=><span key={i}>★</span>)}
                        </td>
                        <td className="p-4 bg-yellow-50 font-mono">
                           {bid ? (
                               bid.is_fold ? <span className="text-gray-400 text-sm">FOLD ({bid.bid_seconds}s)</span> : <span className="text-blue-600 font-bold">{bid.bid_seconds}s</span>
                           ) : <span className="text-red-300 animate-pulse text-xs">Waiting...</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
           </div>
        </div>
      )}
    </div>
  )
}
