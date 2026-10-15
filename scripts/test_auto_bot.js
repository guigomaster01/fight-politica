const WebSocket = require('ws');

async function testAutoBot() {
  console.log('--- Testing Auto Bot Entrance ---');
  const ws = new WebSocket('ws://localhost:3000');

  await new Promise(r => ws.on('open', r));
  console.log('✓ Connected to server');

  let waitingReceived = false;
  let matchFound = null;

  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.type === 'waiting_opponent') {
      waitingReceived = true;
      console.log('✓ In queue: waiting for opponent...');
    } else if (msg.type === 'match_found') {
      matchFound = msg;
    }
  });

  // Player picks 13
  ws.send(JSON.stringify({ type: 'join_queue', character: '13', name: 'Jogador Teste' }));
  await new Promise(r => setTimeout(r, 300));

  if (!waitingReceived) {
    throw new Error('Did not receive waiting_opponent');
  }

  // Simulate 8s countdown expiration -> auto triggers play_vs_bot
  console.log('⏳ Simulating 8s timer expiration...');
  ws.send(JSON.stringify({ type: 'play_vs_bot', character: '13', name: 'Jogador Teste' }));
  await new Promise(r => setTimeout(r, 500));

  if (!matchFound) {
    throw new Error('Match found not received after triggering bot');
  }

  console.log(`✓ Bot match started successfully!`);
  console.log(`  Room: ${matchFound.roomId}`);
  console.log(`  Character: ${matchFound.character}`);
  console.log(`  Opponent: ${matchFound.opponentName} (isBot: ${matchFound.isBot})`);

  ws.close();
  console.log('✓ Auto-bot integration test PASSED!');
}

testAutoBot().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
