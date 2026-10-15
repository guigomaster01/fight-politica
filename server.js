const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Matchmaking queues
let queue13 = []; // Sockets waiting for character 13
let queue22 = []; // Sockets waiting for character 22

// Active battle rooms
const rooms = new Map();

function generateRoomId() {
  return 'room_' + Math.random().toString(36).substring(2, 9);
}

function removeFromQueues(ws) {
  queue13 = queue13.filter(entry => entry.ws !== ws);
  queue22 = queue22.filter(entry => entry.ws !== ws);
  broadcastQueueStatus();
}

function broadcastQueueStatus() {
  const status = JSON.stringify({
    type: 'queue_update',
    waiting13: queue13.length,
    waiting22: queue22.length,
    activeBattles: rooms.size
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(status);
    }
  });
}

function createRoom(player13, player22, isBot = false) {
  const roomId = generateRoomId();

  const room = {
    id: roomId,
    isBot,
    createdAt: Date.now(),
    players: {
      '13': {
        ws: player13.ws,
        id: player13.id,
        name: player13.name || 'Guerreiro 13',
        hp: 100,
        special: 0,
        isBlocking: false,
        lastAttackTime: 0,
        stats: { hitsLanded: 0, damageDealt: 0 }
      },
      '22': {
        ws: player22 ? player22.ws : null,
        id: player22 ? player22.id : 'bot_22',
        name: player22 ? (player22.name || 'Guerreiro 22') : 'Capitão Bot 22 [IA]',
        hp: 100,
        special: 0,
        isBlocking: false,
        lastAttackTime: 0,
        stats: { hitsLanded: 0, damageDealt: 0 }
      }
    },
    botInterval: null,
    round: 1,
    status: 'fighting'
  };

  rooms.set(roomId, room);

  // Bind room to players
  if (player13.ws) player13.ws.currentRoomId = roomId;
  if (player22 && player22.ws) player22.ws.currentRoomId = roomId;

  // Send match found to Player 13
  if (player13.ws && player13.ws.readyState === WebSocket.OPEN) {
    player13.ws.send(JSON.stringify({
      type: 'match_found',
      roomId,
      character: '13',
      opponentCharacter: '22',
      opponentName: room.players['22'].name,
      isBot,
      state: getSanitizedState(room)
    }));
  }

  // Send match found to Player 22
  if (player22 && player22.ws && player22.ws.readyState === WebSocket.OPEN) {
    player22.ws.send(JSON.stringify({
      type: 'match_found',
      roomId,
      character: '22',
      opponentCharacter: '13',
      opponentName: room.players['13'].name,
      isBot: false,
      state: getSanitizedState(room)
    }));
  }

  // If this room has a Bot, run bot AI loop
  if (isBot) {
    startBotAI(room);
  }

  broadcastQueueStatus();
  return room;
}

function getSanitizedState(room) {
  return {
    players: {
      '13': {
        hp: room.players['13'].hp,
        special: room.players['13'].special,
        isBlocking: room.players['13'].isBlocking,
        name: room.players['13'].name
      },
      '22': {
        hp: room.players['22'].hp,
        special: room.players['22'].special,
        isBlocking: room.players['22'].isBlocking,
        name: room.players['22'].name
      }
    },
    status: room.status,
    round: room.round
  };
}

function broadcastToRoom(room, data) {
  const payload = JSON.stringify(data);
  for (const char of ['13', '22']) {
    const p = room.players[char];
    if (p && p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(payload);
    }
  }
}

function handleAttack(room, attackerChar, attackType) {
  if (!room || room.status !== 'fighting') return;

  const defenderChar = attackerChar === '13' ? '22' : '13';
  const attacker = room.players[attackerChar];
  const defender = room.players[defenderChar];

  if (attacker.hp <= 0 || defender.hp <= 0) return;

  const now = Date.now();
  let baseDamage = 0;
  let specialGainAttacker = 0;
  let specialCost = 0;
  let isCrit = Math.random() < 0.18; // 18% crit chance

  if (attackType === 'quick') {
    // Quick punch
    if (now - attacker.lastAttackTime < 400) return; // Cooldown 400ms
    baseDamage = 8 + Math.floor(Math.random() * 5); // 8-12 damage
    specialGainAttacker = 10;
  } else if (attackType === 'heavy') {
    // Heavy kick
    if (now - attacker.lastAttackTime < 900) return; // Cooldown 900ms
    baseDamage = 14 + Math.floor(Math.random() * 6); // 14-19 damage
    specialGainAttacker = 18;
  } else if (attackType === 'special') {
    // Ultimate special move
    if (attacker.special < 100) return; // Must have 100%
    baseDamage = 28 + Math.floor(Math.random() * 8); // 28-35 damage
    specialCost = 100;
    isCrit = true;
  } else {
    return;
  }

  attacker.lastAttackTime = now;
  if (isCrit) {
    baseDamage = Math.round(baseDamage * 1.35);
  }

  // Damage calculation considering defender block
  let finalDamage = baseDamage;
  const isBlocked = defender.isBlocking;
  if (isBlocked) {
    finalDamage = Math.max(2, Math.round(baseDamage * 0.3)); // 70% damage reduction
  }

  defender.hp = Math.max(0, defender.hp - finalDamage);
  attacker.special = Math.min(100, Math.max(0, attacker.special - specialCost + specialGainAttacker));
  // Defender gains a little special when taking hits (comeback mechanic)
  defender.special = Math.min(100, defender.special + (isBlocked ? 5 : 8));

  attacker.stats.hitsLanded += 1;
  attacker.stats.damageDealt += finalDamage;

  const eventPayload = {
    type: 'combat_action',
    attacker: attackerChar,
    defender: defenderChar,
    attackType,
    damage: finalDamage,
    isCrit,
    isBlocked,
    state: getSanitizedState(room)
  };

  broadcastToRoom(room, eventPayload);

  // Check K.O.
  if (defender.hp <= 0) {
    room.status = 'game_over';
    if (room.botInterval) clearInterval(room.botInterval);

    broadcastToRoom(room, {
      type: 'game_over',
      winner: attackerChar,
      loser: defenderChar,
      reason: 'ko',
      stats: {
        '13': room.players['13'].stats,
        '22': room.players['22'].stats
      }
    });
  }
}

function handleBlock(room, character, active) {
  if (!room || room.status !== 'fighting') return;
  const p = room.players[character];
  if (!p) return;
  p.isBlocking = !!active;

  broadcastToRoom(room, {
    type: 'block_state',
    character,
    isBlocking: p.isBlocking
  });
}

function handleTaunt(room, character, phrase) {
  if (!room || room.status !== 'fighting') return;
  broadcastToRoom(room, {
    type: 'taunt',
    character,
    phrase
  });
}

function handleRematch(room, requestedByChar) {
  if (!room) return;
  // Reset room HP and start new round
  room.players['13'].hp = 100;
  room.players['13'].special = 0;
  room.players['13'].isBlocking = false;
  room.players['22'].hp = 100;
  room.players['22'].special = 0;
  room.players['22'].isBlocking = false;
  room.status = 'fighting';
  room.round += 1;

  broadcastToRoom(room, {
    type: 'rematch_started',
    round: room.round,
    state: getSanitizedState(room)
  });

  if (room.isBot) {
    startBotAI(room);
  }
}

function startBotAI(room) {
  if (room.botInterval) clearInterval(room.botInterval);

  const botChar = '22'; // Bot plays character 22
  const botPhrases = [
    'Aqui é na pressão!',
    'Não vai levar essa!',
    'É melhor se preparar!',
    'Sentiu o peso do golpe?'
  ];

  room.botInterval = setInterval(() => {
    if (room.status !== 'fighting') {
      clearInterval(room.botInterval);
      return;
    }

    const bot = room.players[botChar];
    const opponent = room.players['13'];
    if (bot.hp <= 0 || opponent.hp <= 0) return;

    const roll = Math.random();

    // Occasional taunt
    if (roll < 0.08) {
      const phrase = botPhrases[Math.floor(Math.random() * botPhrases.length)];
      handleTaunt(room, botChar, phrase);
      return;
    }

    // Bot decision tree
    if (bot.special >= 100 && Math.random() < 0.6) {
      // Release ultimate!
      handleAttack(room, botChar, 'special');
    } else if (roll < 0.25) {
      // Temporarily guard
      handleBlock(room, botChar, true);
      setTimeout(() => {
        if (room && room.players[botChar]) {
          handleBlock(room, botChar, false);
        }
      }, 700 + Math.random() * 500);
    } else if (roll < 0.65) {
      // Quick attack
      handleAttack(room, botChar, 'quick');
    } else {
      // Heavy attack
      handleAttack(room, botChar, 'heavy');
    }
  }, 1000 + Math.random() * 800);
}

// WebSocket Connection Management
wss.on('connection', (ws) => {
  ws.id = 'usr_' + Math.random().toString(36).substring(2, 9);
  ws.currentRoomId = null;

  // Send initial connection status
  ws.send(JSON.stringify({
    type: 'connected',
    userId: ws.id,
    waiting13: queue13.length,
    waiting22: queue22.length,
    activeBattles: rooms.size
  }));

  ws.on('message', (messageRaw) => {
    try {
      const msg = JSON.parse(messageRaw);

      if (msg.type === 'join_queue') {
        const chosenChar = msg.character === '13' ? '13' : '22';
        const playerName = (msg.name || '').trim().substring(0, 16) || `Jogador ${chosenChar}`;

        removeFromQueues(ws);

        // Core Requirement Matchmaking:
        // "Quando o usuário escolher o personagem vai procurar o próximo personagem oposto,
        // ou seja, se eu escolher 22 o próximo que escolher 13 vai batalhar contra mim"
        if (chosenChar === '13') {
          if (queue22.length > 0) {
            // Found waiting 22 opponent!
            const opponentEntry = queue22.shift();
            createRoom({ ws, id: ws.id, name: playerName }, opponentEntry, false);
          } else {
            // Queue up for 13
            queue13.push({ ws, id: ws.id, name: playerName });
            ws.send(JSON.stringify({
              type: 'waiting_opponent',
              character: '13',
              targetCharacter: '22',
              message: 'Aguardando oponente escolher o Personagem 22...'
            }));
            broadcastQueueStatus();
          }
        } else if (chosenChar === '22') {
          if (queue13.length > 0) {
            // Found waiting 13 opponent!
            const opponentEntry = queue13.shift();
            createRoom(opponentEntry, { ws, id: ws.id, name: playerName }, false);
          } else {
            // Queue up for 22
            queue22.push({ ws, id: ws.id, name: playerName });
            ws.send(JSON.stringify({
              type: 'waiting_opponent',
              character: '22',
              targetCharacter: '13',
              message: 'Aguardando oponente escolher o Personagem 13...'
            }));
            broadcastQueueStatus();
          }
        }
      } else if (msg.type === 'play_vs_bot') {
        // Fallback or solo test: play against smart AI
        removeFromQueues(ws);
        const chosenChar = msg.character === '13' ? '13' : '22';
        const playerName = (msg.name || '').trim().substring(0, 16) || `Jogador ${chosenChar}`;

        if (chosenChar === '13') {
          createRoom({ ws, id: ws.id, name: playerName }, null, true);
        } else {
          // Player is 22, Bot is 13
          const roomId = generateRoomId();
          const room = {
            id: roomId,
            isBot: true,
            createdAt: Date.now(),
            players: {
              '13': {
                ws: null,
                id: 'bot_13',
                name: 'Companheiro Bot 13 [IA]',
                hp: 100,
                special: 0,
                isBlocking: false,
                lastAttackTime: 0,
                stats: { hitsLanded: 0, damageDealt: 0 }
              },
              '22': {
                ws: ws,
                id: ws.id,
                name: playerName,
                hp: 100,
                special: 0,
                isBlocking: false,
                lastAttackTime: 0,
                stats: { hitsLanded: 0, damageDealt: 0 }
              }
            },
            botInterval: null,
            round: 1,
            status: 'fighting'
          };
          rooms.set(roomId, room);
          ws.currentRoomId = roomId;

          ws.send(JSON.stringify({
            type: 'match_found',
            roomId,
            character: '22',
            opponentCharacter: '13',
            opponentName: room.players['13'].name,
            isBot: true,
            state: getSanitizedState(room)
          }));

          // Bot 13 loop
          startBotAIFor13(room);
          broadcastQueueStatus();
        }
      } else if (msg.type === 'attack') {
        if (!ws.currentRoomId) return;
        const room = rooms.get(ws.currentRoomId);
        if (room) {
          const char = room.players['13'].ws === ws ? '13' : (room.players['22'].ws === ws ? '22' : null);
          if (char) {
            handleAttack(room, char, msg.attackType);
          }
        }
      } else if (msg.type === 'block') {
        if (!ws.currentRoomId) return;
        const room = rooms.get(ws.currentRoomId);
        if (room) {
          const char = room.players['13'].ws === ws ? '13' : (room.players['22'].ws === ws ? '22' : null);
          if (char) {
            handleBlock(room, char, !!msg.active);
          }
        }
      } else if (msg.type === 'taunt') {
        if (!ws.currentRoomId) return;
        const room = rooms.get(ws.currentRoomId);
        if (room) {
          const char = room.players['13'].ws === ws ? '13' : (room.players['22'].ws === ws ? '22' : null);
          if (char) {
            handleTaunt(room, char, msg.phrase || 'Luta limpa!');
          }
        }
      } else if (msg.type === 'rematch') {
        if (!ws.currentRoomId) return;
        const room = rooms.get(ws.currentRoomId);
        if (room) {
          const char = room.players['13'].ws === ws ? '13' : (room.players['22'].ws === ws ? '22' : null);
          handleRematch(room, char);
        }
      } else if (msg.type === 'cancel_queue') {
        removeFromQueues(ws);
        ws.send(JSON.stringify({ type: 'queue_cancelled' }));
      }
    } catch (e) {
      console.error('Socket message parse error:', e);
    }
  });

  ws.on('close', () => {
    removeFromQueues(ws);

    if (ws.currentRoomId) {
      const room = rooms.get(ws.currentRoomId);
      if (room) {
        if (room.botInterval) clearInterval(room.botInterval);
        broadcastToRoom(room, {
          type: 'opponent_left',
          message: 'Oponente desconectou-se da partida.'
        });
        rooms.delete(ws.currentRoomId);
      }
    }
    broadcastQueueStatus();
  });
});

function startBotAIFor13(room) {
  if (room.botInterval) clearInterval(room.botInterval);
  const botChar = '13';
  const botPhrases = [
    'A união faz a força!',
    'Não adianta correr!',
    'Golpe do trabalhador!',
    'Esse round é nosso!'
  ];

  room.botInterval = setInterval(() => {
    if (room.status !== 'fighting') {
      clearInterval(room.botInterval);
      return;
    }

    const bot = room.players[botChar];
    const opponent = room.players['22'];
    if (bot.hp <= 0 || opponent.hp <= 0) return;

    const roll = Math.random();

    if (roll < 0.08) {
      const phrase = botPhrases[Math.floor(Math.random() * botPhrases.length)];
      handleTaunt(room, botChar, phrase);
      return;
    }

    if (bot.special >= 100 && Math.random() < 0.6) {
      handleAttack(room, botChar, 'special');
    } else if (roll < 0.25) {
      handleBlock(room, botChar, true);
      setTimeout(() => {
        if (room && room.players[botChar]) {
          handleBlock(room, botChar, false);
        }
      }, 700 + Math.random() * 500);
    } else if (roll < 0.65) {
      handleAttack(room, botChar, 'quick');
    } else {
      handleAttack(room, botChar, 'heavy');
    }
  }, 1000 + Math.random() * 800);
}

server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`⚔️  POLÍTICA FIGHT 13 vs 22 - Arcade Server`);
  console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
