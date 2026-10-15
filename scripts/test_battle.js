const WebSocket = require('ws');

async function testMatchmakingAndBattle() {
  console.log('--- Testing 13 vs 22 Matchmaking & Battle ---');

  // Client 1 (Personagem 22)
  const ws22 = new WebSocket('ws://localhost:3000');
  // Client 2 (Personagem 13)
  const ws13 = new WebSocket('ws://localhost:3000');

  await Promise.all([
    new Promise(res => ws22.on('open', res)),
    new Promise(res => ws13.on('open', res))
  ]);
  console.log('✓ Both clients connected');

  let matchFound22 = null;
  let matchFound13 = null;

  ws22.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.type === 'match_found') matchFound22 = msg;
  });

  ws13.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.type === 'match_found') matchFound13 = msg;
  });

  // Player 1 picks 22
  ws22.send(JSON.stringify({ type: 'join_queue', character: '22', name: 'Jogador 22' }));
  console.log('✓ Player A queued as 22');

  // Small delay, then Player 2 picks 13
  await new Promise(r => setTimeout(r, 200));
  ws13.send(JSON.stringify({ type: 'join_queue', character: '13', name: 'Jogador 13' }));
  console.log('✓ Player B queued as 13');

  // Wait for match
  await new Promise(r => setTimeout(r, 400));

  if (!matchFound22 || !matchFound13) {
    throw new Error('Matchmaking failed: Both players did not receive match_found');
  }

  console.log(`✓ Match found! Room: ${matchFound22.roomId}`);
  console.log(`  Player 22 assigned: ${matchFound22.character}, opponent: ${matchFound22.opponentCharacter}`);
  console.log(`  Player 13 assigned: ${matchFound13.character}, opponent: ${matchFound13.opponentCharacter}`);

  // Test attacks
  let combatEvents = [];
  ws22.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.type === 'combat_action') combatEvents.push(msg);
  });

  // Player 22 attacks Player 13 with quick attack
  ws22.send(JSON.stringify({ type: 'attack', attackType: 'quick' }));
  await new Promise(r => setTimeout(r, 300));

  if (combatEvents.length === 0) {
    throw new Error('Combat event was not broadcasted');
  }

  const evt = combatEvents[0];
  console.log(`✓ Attack landed! Attacker: ${evt.attacker}, Damage: ${evt.damage}, Defender 13 HP: ${evt.state.players['13'].hp}/100`);

  if (evt.state.players['13'].hp >= 100) {
    throw new Error('HP did not decrease');
  }

  // Wait for heavy attack cooldown (1000ms)
  await new Promise(r => setTimeout(r, 1000));

  // Player 13 activates block
  ws13.send(JSON.stringify({ type: 'block', active: true }));
  await new Promise(r => setTimeout(r, 200));

  // Player 22 attacks again while 13 is blocking
  ws22.send(JSON.stringify({ type: 'attack', attackType: 'heavy' }));
  await new Promise(r => setTimeout(r, 400));

  const blockEvt = combatEvents[combatEvents.length - 1];
  console.log(`✓ Blocked attack! Was blocked: ${blockEvt.isBlocked}, Damage: ${blockEvt.damage}, Defender 13 HP: ${blockEvt.state.players['13'].hp}/100`);

  ws22.close();
  ws13.close();
  console.log('✓ All tests PASSED successfully!');
}

testMatchmakingAndBattle().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
