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

  // [新增] 設定選項 State
  const [configTime, setConfigTime] = useState<number>(600)
  const [configRounds, setConfigRounds] = useState<number>(19)

  // 防止重複結算的鎖
  const isSettlingRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) initDashboard()
    })
  }, [])

  // 自動結算監聽器
  useEffect(() => {
    if (!gameState || gameState.game_status !== 'bidding' || players.length === 0) return

    const currentRoundBids = bids.filter(b => b.round_number === gameState.current_round)
    
    if (currentRoundBids.length === players.length && !isSettlingRef.current) {
        console.log("All players have bid. Auto settling...")
        settleRound()
    }
  }, [bids, players, gameState])

  // 當從 DB 載入房間設定時，同步更新 UI 選項
  useEffect(() => {
    if (gameState) {
      if (gameState.settings_initial_time) setConfigTime(gameState.settings_initial_time)
      if (gameState.settings_total_rounds) setConfigRounds(gameState.settings_total_rounds)
    }
  }, [gameState?.settings_initial_time, gameState?.settings_total_rounds])


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
    
    // [新增] 檢查是否超過總回合數
    if (gameState.current_round >= gameState.settings_total_rounds) {
        alert("Game Over! Max rounds reached.")
        return
    }

    isSettlingRef.current = false
    setBids([]) 
    await supabase.from('ta_rooms').update({
      current_round: gameState.current_round + 1,
      game_status: 'bidding'
    }).eq('id', gameState.id)
  }

  const settleRound = async () => {
    if (!gameState || isSettlingRef.current) return
    isSettlingRef.current = true

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
  
  // [修改] 支援設定的重置功能
  const resetGame = async () => {
      const confirmMsg = `⚠️ DANGER: FULL RESET? \n\n將套用新設定：\n時間: ${configTime}s\n回合: ${configRounds}\n\n這將刪除所有玩家！`
      if(!confirm(confirmMsg)) return
      
      const { error } = await supabase.from('ta_players').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      
      if (error) {
        console.error(error)
        alert("Reset Failed: " + error.message)
        return
      }

      // [新增] 更新房間設定
      await supabase.from('ta_rooms').update({ 
          current_round: 1, 
          game_status: 'waiting',
          settings_initial_time: configTime,
          settings_total_rounds: configRounds
      }).eq('id', gameState.id)
      
      alert("Game Reset & Settings Applied!")
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
             <button onClick={() => supabase.auth.signOut().then(()=>setSession(null))} className="px-4 py-2 text-gray-500 underline">Logout</button>
        </div>
      </div>

      {/* [新增] 遊戲設定區塊 */}
      <div className="bg-white p-6 rounded-xl shadow border-2 border-purple-100 mb-8">
          <h3 className="text-lg font-bold mb-4 text-purple-900">⚙️ Game Configuration (Apply on Reset)</h3>
          <div className="flex flex-wrap gap-8 items-end">
              
              {/* 時間設定 */}
              <div>
                  <label className="block text-sm font-bold text-gray-500 mb-2">Total Time (Seconds)</label>
                  <div className="flex gap-2">
                      {[60, 180, 600].map(t => (
                          <button 
                              key={t}
                              onClick={() => setConfigTime(t)}
                              className={`px-4 py-2 rounded border ${configTime === t ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                          >
                              {t}s
                          </button>
                      ))}
                  </div>
              </div>

              {/* 回合設定 */}
              <div>
                  <label className="block text-sm font-bold text-gray-500 mb-2">Total Rounds</label>
                  <div className="flex gap-2">
                      {[3, 10, 19].map(r => (
                          <button 
                              key={r}
                              onClick={() => setConfigRounds(r)}
                              className={`px-4 py-2 rounded border ${configRounds === r ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                          >
                              {r} Rounds
                          </button>
                      ))}
                  </div>
              </div>

              {/* 重置按鈕 */}
              <button onClick={resetGame} className="px-6 py-3 bg-red-600 text-white rounded font-bold hover:bg-red-700 shadow-lg ml-auto">
                 ⚠️ APPLY & FULL RESET
              </button>
          </div>
      </div>

      {gameState && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           {/* 控制面板 */}
           <div className="md:col-span-1 bg-white p-6 rounded-xl shadow border-2 border-blue-100">
              <div className="text-sm text-gray-500 uppercase">Current Status</div>
              <div className="text-4xl font-bold mb-4">{gameState.game_status}</div>
              {/* [修改] 顯示動態總回合數 */}
              <div className="text-xl mb-6">Round: <span className="font-mono font-bold text-blue-600">{gameState.current_round}</span> / {gameState.settings_total_rounds || 19}</div>
              
              <div className="flex flex-col gap-3">
                 <button onClick={nextRound} disabled={gameState.game_status === 'bidding'} className="p-4 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50">
                    1. Start Round
                 </button>
                 
                 <button onClick={settleRound} disabled={gameState.game_status === 'revealed'} className="p-4 bg-gray-500 text-white rounded font-bold hover:bg-gray-600 disabled:opacity-50 text-sm">
                    Manual Settle
                 </button>
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
