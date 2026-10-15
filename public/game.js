// =========================================================
// POLÍTICA FIGHT: 13 vs 22 - Arcade Client Controller
// =========================================================

class ArcadeGameClient {
  constructor() {
    this.ws = null;
    this.selectedChar = null; // '13' | '22'
    this.myChar = null; // In-battle character
    this.opponentChar = null;
    this.isBot = false;
    this.currentRoomId = null;
    this.botCountdownInterval = null;

    // Local Game State
    this.state = {
      round: 1,
      status: 'idle',
      players: {
        '13': { hp: 100, special: 0, isBlocking: false, name: 'Personagem 13' },
        '22': { hp: 100, special: 0, isBlocking: false, name: 'Personagem 22' }
      }
    };

    // Cooldown trackers
    this.cooldowns = {
      quick: 0,
      heavy: 0,
      special: 0
    };

    // Particle FX Canvas
    this.fxCanvas = document.getElementById('fx-canvas');
    this.fxCtx = this.fxCanvas ? this.fxCanvas.getContext('2d') : null;
    this.particles = [];

    // DOM Elements
    this.screens = {
      title: document.getElementById('screen-title'),
      select: document.getElementById('screen-select'),
      queue: document.getElementById('screen-queue'),
      battle: document.getElementById('screen-battle')
    };

    this.init();
  }

  init() {
    this.setupWebSocket();
    this.setupEventListeners();
    this.setupFxCanvas();
    this.startFxLoop();
  }

  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('⚡ Conectado ao servidor Arcade!');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (err) {
        console.error('Erro ao processar mensagem do servidor:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('Desconectado do servidor. Tentando reconectar em 2s...');
      setTimeout(() => this.setupWebSocket(), 2000);
    };
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'connected':
        this.updateQueueStats(msg.waiting13, msg.waiting22, msg.activeBattles);
        break;

      case 'queue_update':
        this.updateQueueStats(msg.waiting13, msg.waiting22, msg.activeBattles);
        break;

      case 'waiting_opponent':
        this.showScreen('queue');
        this.updateQueueScreen(msg.character, msg.targetCharacter, msg.message);
        break;

      case 'match_found':
        this.myChar = msg.character;
        this.opponentChar = msg.opponentCharacter;
        this.isBot = !!msg.isBot;
        this.currentRoomId = msg.roomId;
        this.state = msg.state;

        window.arcadeAudio.playMatchFound();
        this.startMatchCountdown();
        break;

      case 'combat_action':
        this.onCombatAction(msg);
        break;

      case 'block_state':
        this.onBlockState(msg.character, msg.isBlocking);
        break;

      case 'taunt':
        this.showTauntBubble(msg.character, msg.phrase);
        break;

      case 'game_over':
        this.onGameOver(msg);
        break;

      case 'rematch_started':
        this.state = msg.state;
        this.state.round = msg.round;
        this.resetArenaUI();
        this.hideGameOverModal();
        this.showFightBanner(`ROUND ${msg.round}`);
        window.arcadeAudio.playFightGong();
        break;

      case 'opponent_left':
        alert(msg.message || 'Oponente desconectou-se.');
        this.showScreen('select');
        break;
    }
  }

  updateQueueStats(w13, w22, active) {
    const el13 = document.getElementById('stat-waiting-13');
    const el22 = document.getElementById('stat-waiting-22');
    const elAct = document.getElementById('stat-active-fights');
    if (el13) el13.textContent = w13 || 0;
    if (el22) el22.textContent = w22 || 0;
    if (elAct) elAct.textContent = active || 0;
  }

  showScreen(screenName) {
    if (screenName !== 'queue') {
      this.clearBotCountdown();
    }
    Object.values(this.screens).forEach(scr => {
      if (scr) scr.classList.remove('active');
    });
    if (this.screens[screenName]) {
      this.screens[screenName].classList.add('active');
    }
  }

  setupEventListeners() {
    // 1. Audio and CRT Toggles in Top Arcade Bar
    const btnAudio = document.getElementById('btn-toggle-audio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        const isMuted = window.arcadeAudio.toggleMute();
        btnAudio.innerHTML = isMuted ? '🔇 SOM: OFF' : '🔊 SOM: ON';
        btnAudio.classList.toggle('active', !isMuted);
      });
    }

    const btnBgm = document.getElementById('btn-toggle-bgm');
    if (btnBgm) {
      btnBgm.addEventListener('click', () => {
        const playing = window.arcadeAudio.toggleBgm();
        btnBgm.innerHTML = playing ? '🎵 MÚSICA: ON' : '🎵 MÚSICA: OFF';
        btnBgm.classList.toggle('active', playing);
      });
    }

    const btnCrt = document.getElementById('btn-toggle-crt');
    const crtOverlay = document.querySelector('.crt-overlay');
    if (btnCrt && crtOverlay) {
      btnCrt.addEventListener('click', () => {
        crtOverlay.classList.toggle('disabled');
        const isActive = !crtOverlay.classList.contains('disabled');
        btnCrt.innerHTML = isActive ? '📺 CRT: ON' : '📺 CRT: OFF';
        btnCrt.classList.toggle('active', isActive);
      });
    }

    // 2. Start Screen -> Select Screen
    const btnStartGame = document.getElementById('btn-start-game');
    if (btnStartGame) {
      btnStartGame.addEventListener('click', () => {
        window.arcadeAudio.playConfirm();
        this.showScreen('select');
      });
    }

    // 3. Character Selection
    const charCards = document.querySelectorAll('.char-card');
    const btnConfirmChar = document.getElementById('btn-confirm-char');

    charCards.forEach(card => {
      card.addEventListener('click', () => {
        charCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedChar = card.getAttribute('data-char');
        window.arcadeAudio.playSelect();

        if (btnConfirmChar) {
          btnConfirmChar.disabled = false;
          btnConfirmChar.textContent = `BUSCAR OPONENTE COM O ${this.selectedChar}`;
        }
      });
    });

    if (btnConfirmChar) {
      btnConfirmChar.addEventListener('click', () => {
        if (!this.selectedChar) return;
        window.arcadeAudio.playConfirm();
        this.joinMatchmaking(this.selectedChar);
      });
    }

    // 4. Queue Screen Buttons
    const btnCancelQueue = document.getElementById('btn-cancel-queue');
    if (btnCancelQueue) {
      btnCancelQueue.addEventListener('click', () => {
        this.clearBotCountdown();
        window.arcadeAudio.playBlip(300, 0.08);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'cancel_queue' }));
        }
        this.showScreen('select');
      });
    }

    const btnPlayBot = document.getElementById('btn-play-bot');
    if (btnPlayBot) {
      btnPlayBot.addEventListener('click', () => {
        this.triggerBotMatch();
      });
    }

    const btnCopyUrl = document.getElementById('btn-copy-url');
    if (btnCopyUrl) {
      btnCopyUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          btnCopyUrl.textContent = '✅ Copiado!';
          window.arcadeAudio.playBlip(750, 0.08);
          setTimeout(() => { btnCopyUrl.textContent = '📋 Copiar Link'; }, 2000);
        }).catch(() => {
          btnCopyUrl.textContent = 'Acesse: ' + window.location.host;
        });
      });
    }

    // 5. In-Battle Action Buttons
    const btnQuick = document.getElementById('btn-act-quick');
    const btnHeavy = document.getElementById('btn-act-heavy');
    const btnGuard = document.getElementById('btn-act-guard');
    const btnSpecial = document.getElementById('btn-act-special');
    const btnTaunt = document.getElementById('btn-act-taunt');

    if (btnQuick) {
      btnQuick.addEventListener('click', () => this.performAttack('quick'));
    }
    if (btnHeavy) {
      btnHeavy.addEventListener('click', () => this.performAttack('heavy'));
    }
    if (btnSpecial) {
      btnSpecial.addEventListener('click', () => this.performAttack('special'));
    }

    if (btnGuard) {
      let isGuarding = false;
      const setGuard = (active) => {
        if (isGuarding === active) return;
        isGuarding = active;
        btnGuard.classList.toggle('active', active);
        this.sendBlock(active);
      };

      // Mouse/Touch hold or click
      btnGuard.addEventListener('mousedown', () => setGuard(true));
      window.addEventListener('mouseup', () => setGuard(false));
      btnGuard.addEventListener('touchstart', (e) => { e.preventDefault(); setGuard(true); });
      window.addEventListener('touchend', () => setGuard(false));
    }

    if (btnTaunt) {
      btnTaunt.addEventListener('click', () => this.sendTaunt());
    }

    // Keyboard Shortcuts (J = Quick, K = Heavy, L = Guard, Space = Special, T = Taunt)
    let guardKeyDown = false;
    window.addEventListener('keydown', (e) => {
      if (!this.screens.battle.classList.contains('active')) return;
      if (this.state.status !== 'fighting') return;

      const key = e.key.toLowerCase();
      if (key === 'j' || key === '1') {
        this.performAttack('quick');
      } else if (key === 'k' || key === '2') {
        this.performAttack('heavy');
      } else if (key === 'l' || key === '3') {
        if (!guardKeyDown) {
          guardKeyDown = true;
          const btn = document.getElementById('btn-act-guard');
          if (btn) btn.classList.add('active');
          this.sendBlock(true);
        }
      } else if (key === ' ' || key === 'enter') {
        e.preventDefault();
        this.performAttack('special');
      } else if (key === 't') {
        this.sendTaunt();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'l' || key === '3') {
        guardKeyDown = false;
        const btn = document.getElementById('btn-act-guard');
        if (btn) btn.classList.remove('active');
        this.sendBlock(false);
      }
    });

    // Rematch / Change Character in Modal
    const btnRematch = document.getElementById('btn-modal-rematch');
    if (btnRematch) {
      btnRematch.addEventListener('click', () => {
        window.arcadeAudio.playConfirm();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'rematch' }));
        }
      });
    }

    const btnChangeChar = document.getElementById('btn-modal-change');
    if (btnChangeChar) {
      btnChangeChar.addEventListener('click', () => {
        window.arcadeAudio.playSelect();
        this.hideGameOverModal();
        this.showScreen('select');
      });
    }
  }

  joinMatchmaking(char) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'join_queue',
        character: char
      }));
    }
  }

  updateQueueScreen(char, targetChar, msg) {
    const queueCharSpan = document.getElementById('queue-chosen-char');
    const queueTargetSpan = document.getElementById('queue-target-char');
    const queueMsg = document.getElementById('queue-status-msg');

    if (queueCharSpan) queueCharSpan.textContent = `Personagem ${char}`;
    if (queueTargetSpan) queueTargetSpan.textContent = `Personagem ${targetChar}`;
    if (queueMsg) queueMsg.textContent = msg || `Aguardando alguém escolher o ${targetChar}...`;

    // Start 8-second auto countdown to fight the bot
    this.startBotCountdown();
  }

  startBotCountdown() {
    this.clearBotCountdown();
    let remaining = 8;
    const countEl = document.getElementById('queue-countdown');
    const btnSec = document.getElementById('btn-countdown-sec');

    if (countEl) countEl.textContent = `${remaining}s`;
    if (btnSec) btnSec.textContent = `${remaining}s`;

    this.botCountdownInterval = setInterval(() => {
      remaining--;
      if (countEl) countEl.textContent = `${remaining}s`;
      if (btnSec) btnSec.textContent = `${remaining}s`;

      if (remaining <= 0) {
        this.clearBotCountdown();
        console.log('🤖 8s sem oponente: iniciando batalha contra o Bot IA automaticamente!');
        this.triggerBotMatch();
      }
    }, 1000);
  }

  clearBotCountdown() {
    if (this.botCountdownInterval) {
      clearInterval(this.botCountdownInterval);
      this.botCountdownInterval = null;
    }
  }

  triggerBotMatch() {
    this.clearBotCountdown();
    window.arcadeAudio.playConfirm();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'play_vs_bot',
        character: this.selectedChar
      }));
    }
  }

  startMatchCountdown() {
    this.showScreen('battle');
    this.resetArenaUI();

    // Setup fighter images & cards
    const p1Entity = document.getElementById('entity-p1');
    const p2Entity = document.getElementById('entity-p2');
    const p1Img = document.getElementById('sprite-p1');
    const p2Img = document.getElementById('sprite-p2');

    // Left is always 13, Right is always 22 for visual consistency
    // If the player is 13, they control P1 (left). If 22, they control P2 (right).
    p1Img.src = 'assets/images/char13.png';
    p2Img.src = 'assets/images/char22.png';

    // Label you vs opponent
    const p1YouTag = document.getElementById('tag-you-p1');
    const p2YouTag = document.getElementById('tag-you-p2');
    if (p1YouTag) p1YouTag.style.display = (this.myChar === '13') ? 'inline-block' : 'none';
    if (p2YouTag) p2YouTag.style.display = (this.myChar === '22') ? 'inline-block' : 'none';

    // Update names
    const p1Name = document.getElementById('name-p1');
    const p2Name = document.getElementById('name-p2');
    if (p1Name) p1Name.textContent = this.state.players['13'].name;
    if (p2Name) p2Name.textContent = this.state.players['22'].name;

    this.updateHpBars();
    this.updateSuperBars();

    // Countdown animation
    this.showFightBanner('ROUND 1');
    window.arcadeAudio.playFightGong();

    setTimeout(() => {
      this.showFightBanner('FIGHT!');
      window.arcadeAudio.playFightGong();
    }, 1200);

    setTimeout(() => {
      this.hideFightBanner();
      this.state.status = 'fighting';
    }, 2000);
  }

  showFightBanner(text) {
    const banner = document.getElementById('fight-banner');
    if (banner) {
      banner.textContent = text;
      banner.classList.add('show');
    }
  }

  hideFightBanner() {
    const banner = document.getElementById('fight-banner');
    if (banner) {
      banner.classList.remove('show');
    }
  }

  performAttack(type) {
    if (this.state.status !== 'fighting') return;
    const now = Date.now();

    // Check cooldowns
    if (type === 'quick') {
      if (now < this.cooldowns.quick) return;
      this.cooldowns.quick = now + 400;
      this.triggerCooldownVisual('btn-act-quick', 400);
    } else if (type === 'heavy') {
      if (now < this.cooldowns.heavy) return;
      this.cooldowns.heavy = now + 900;
      this.triggerCooldownVisual('btn-act-heavy', 900);
    } else if (type === 'special') {
      const mySpecial = this.state.players[this.myChar].special;
      if (mySpecial < 100) return;
      if (now < this.cooldowns.special) return;
      this.cooldowns.special = now + 1500;
      this.triggerCooldownVisual('btn-act-special', 1500);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'attack',
        attackType: type
      }));
    }
  }

  sendBlock(active) {
    if (this.state.status !== 'fighting') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'block',
        active
      }));
    }
  }

  sendTaunt() {
    if (this.state.status !== 'fighting') return;
    const phrases13 = ['Companheiro!', 'O povo não desiste!', 'Pelo futuro do Brasil!', 'Vamos à luta!'];
    const phrases22 = ['É melhor se acostumar!', 'Brasil acima de tudo!', 'Pressão total!', 'Não passa nada!'];
    const pool = this.myChar === '13' ? phrases13 : phrases22;
    const phrase = pool[Math.floor(Math.random() * pool.length)];

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'taunt',
        phrase
      }));
    }
  }

  triggerCooldownVisual(btnId, duration) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = true;
    setTimeout(() => {
      btn.disabled = false;
    }, duration);
  }

  onCombatAction(action) {
    const { attacker, defender, attackType, damage, isCrit, isBlocked, state } = action;
    this.state = state;

    // Trigger visual attack lunge
    const attackerEntity = document.getElementById(attacker === '13' ? 'entity-p1' : 'entity-p2');
    const defenderEntity = document.getElementById(defender === '13' ? 'entity-p1' : 'entity-p2');

    if (attackerEntity) {
      const lungeClass = attacker === '13' ? 'attacking-p1' : 'attacking-p2';
      attackerEntity.classList.add(lungeClass);
      setTimeout(() => attackerEntity.classList.remove(lungeClass), 180);
    }

    if (defenderEntity) {
      defenderEntity.classList.add('hit');
      setTimeout(() => defenderEntity.classList.remove('hit'), 250);
    }

    // Audio SFX
    if (attackType === 'special') {
      window.arcadeAudio.playSpecial();
      this.triggerScreenFlash();
      this.triggerScreenShake();
      this.spawnSparks(defenderEntity, 30, '#ff007f');
    } else if (isBlocked) {
      window.arcadeAudio.playBlock();
      this.spawnSparks(defenderEntity, 8, '#00f0ff');
    } else if (attackType === 'heavy' || isCrit) {
      window.arcadeAudio.playKick();
      this.triggerScreenShake();
      this.spawnSparks(defenderEntity, 18, isCrit ? '#ff1744' : '#ffea00');
    } else {
      window.arcadeAudio.playPunch();
      this.spawnSparks(defenderEntity, 10, '#ffd600');
    }

    // Floating damage text
    this.showDamageText(defenderEntity, damage, isCrit, isBlocked);

    // Update HP & Special meters
    this.updateHpBars();
    this.updateSuperBars();
  }

  onBlockState(character, isBlocking) {
    const entity = document.getElementById(character === '13' ? 'entity-p1' : 'entity-p2');
    if (entity) {
      entity.classList.toggle('blocking', isBlocking);
    }
  }

  showTauntBubble(character, phrase) {
    const bubble = document.getElementById(character === '13' ? 'bubble-p1' : 'bubble-p2');
    if (bubble) {
      bubble.textContent = `"${phrase}"`;
      bubble.classList.add('active');
      window.arcadeAudio.playBlip(600, 0.08);
      setTimeout(() => bubble.classList.remove('active'), 2500);
    }
  }

  updateHpBars() {
    const p1Hp = this.state.players['13'].hp;
    const p2Hp = this.state.players['22'].hp;

    // Fill bars
    const fill1 = document.getElementById('hp-fill-p1');
    const ghost1 = document.getElementById('hp-ghost-p1');
    const num1 = document.getElementById('hp-num-p1');

    const fill2 = document.getElementById('hp-fill-p2');
    const ghost2 = document.getElementById('hp-ghost-p2');
    const num2 = document.getElementById('hp-num-p2');

    if (fill1 && ghost1 && num1) {
      fill1.style.width = `${p1Hp}%`;
      num1.textContent = `${p1Hp} / 100`;
      fill1.style.backgroundColor = this.getHpColor(p1Hp);
      setTimeout(() => { ghost1.style.width = `${p1Hp}%`; }, 250);
    }

    if (fill2 && ghost2 && num2) {
      fill2.style.width = `${p2Hp}%`;
      num2.textContent = `${p2Hp} / 100`;
      fill2.style.backgroundColor = this.getHpColor(p2Hp);
      setTimeout(() => { ghost2.style.width = `${p2Hp}%`; }, 250);
    }
  }

  getHpColor(hp) {
    if (hp > 50) return 'var(--hp-green)';
    if (hp > 25) return 'var(--hp-yellow)';
    return 'var(--hp-red)';
  }

  updateSuperBars() {
    const s1 = this.state.players['13'].special;
    const s2 = this.state.players['22'].special;

    const bar1 = document.getElementById('super-fill-p1');
    const bar2 = document.getElementById('super-fill-p2');

    if (bar1) {
      bar1.style.width = `${s1}%`;
      bar1.classList.toggle('max', s1 >= 100);
    }
    if (bar2) {
      bar2.style.width = `${s2}%`;
      bar2.classList.toggle('max', s2 >= 100);
    }

    // Enable/disable special button for active player
    const mySpecial = this.state.players[this.myChar] ? this.state.players[this.myChar].special : 0;
    const btnSpecial = document.getElementById('btn-act-special');
    if (btnSpecial) {
      btnSpecial.classList.toggle('ready', mySpecial >= 100);
      btnSpecial.disabled = mySpecial < 100;
    }
  }

  showDamageText(targetEntity, damage, isCrit, isBlocked) {
    if (!targetEntity) return;
    const rect = targetEntity.getBoundingClientRect();
    const gameContainer = document.getElementById('game-container').getBoundingClientRect();

    const span = document.createElement('span');
    span.className = 'damage-number';
    if (isCrit) span.classList.add('crit');
    if (isBlocked) span.classList.add('blocked');

    if (isBlocked) {
      span.textContent = `DEFENDEU! -${damage}`;
    } else if (isCrit) {
      span.textContent = `CRÍTICO! -${damage}`;
    } else {
      span.textContent = `-${damage}`;
    }

    span.style.left = `${(rect.left - gameContainer.left) + rect.width / 2 - 30}px`;
    span.style.top = `${(rect.top - gameContainer.top) + rect.height * 0.3}px`;

    const arena = document.getElementById('screen-battle');
    if (arena) {
      arena.appendChild(span);
      setTimeout(() => span.remove(), 900);
    }
  }

  triggerScreenShake() {
    const container = document.getElementById('game-container');
    if (container) {
      container.classList.remove('screen-shake');
      void container.offsetWidth; // Force reflow
      container.classList.add('screen-shake');
      setTimeout(() => container.classList.remove('screen-shake'), 260);
    }
  }

  triggerScreenFlash() {
    const container = document.getElementById('game-container');
    if (container) {
      container.classList.remove('screen-flash');
      void container.offsetWidth;
      container.classList.add('screen-flash');
      setTimeout(() => container.classList.remove('screen-flash'), 260);
    }
  }

  onGameOver(msg) {
    this.state.status = 'game_over';
    window.arcadeAudio.playKo();

    setTimeout(() => {
      this.showGameOverModal(msg);
      if (msg.winner === this.myChar) {
        window.arcadeAudio.playVictory();
      }
    }, 1000);
  }

  showGameOverModal(msg) {
    const modal = document.getElementById('game-over-modal');
    const winnerText = document.getElementById('modal-winner-text');
    const statsHits13 = document.getElementById('stats-hits-13');
    const statsDmg13 = document.getElementById('stats-dmg-13');
    const statsHits22 = document.getElementById('stats-hits-22');
    const statsDmg22 = document.getElementById('stats-dmg-22');

    if (winnerText) {
      winnerText.textContent = `VITÓRIA DO PERSONAGEM ${msg.winner}!`;
      winnerText.style.color = msg.winner === '13' ? 'var(--color-13)' : 'var(--color-22)';
    }

    if (msg.stats) {
      if (statsHits13) statsHits13.textContent = msg.stats['13'].hitsLanded;
      if (statsDmg13) statsDmg13.textContent = msg.stats['13'].damageDealt;
      if (statsHits22) statsHits22.textContent = msg.stats['22'].hitsLanded;
      if (statsDmg22) statsDmg22.textContent = msg.stats['22'].damageDealt;
    }

    if (modal) modal.classList.add('active');
  }

  hideGameOverModal() {
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.classList.remove('active');
  }

  resetArenaUI() {
    this.updateHpBars();
    this.updateSuperBars();
    const p1Entity = document.getElementById('entity-p1');
    const p2Entity = document.getElementById('entity-p2');
    if (p1Entity) p1Entity.className = 'fighter-entity';
    if (p2Entity) p2Entity.className = 'fighter-entity';
  }

  // FX Canvas Spark particles
  setupFxCanvas() {
    if (!this.fxCanvas) return;
    const resizeCanvas = () => {
      const rect = this.fxCanvas.parentElement.getBoundingClientRect();
      this.fxCanvas.width = rect.width;
      this.fxCanvas.height = rect.height;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  spawnSparks(targetEntity, count = 12, color = '#ffd600') {
    if (!this.fxCanvas || !targetEntity) return;
    const rect = targetEntity.getBoundingClientRect();
    const cRect = this.fxCanvas.getBoundingClientRect();
    const originX = (rect.left - cRect.left) + rect.width / 2;
    const originY = (rect.top - cRect.top) + rect.height * 0.45;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      this.particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        size: 2 + Math.random() * 4,
        color,
        life: 1.0,
        decay: 0.03 + Math.random() * 0.04
      });
    }
  }

  startFxLoop() {
    const loop = () => {
      if (this.fxCtx && this.fxCanvas) {
        this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.2; // Gravity
          p.life -= p.decay;

          if (p.life <= 0) {
            this.particles.splice(i, 1);
            continue;
          }

          this.fxCtx.fillStyle = p.color;
          this.fxCtx.globalAlpha = p.life;
          this.fxCtx.fillRect(p.x, p.y, p.size, p.size);
        }
        this.fxCtx.globalAlpha = 1.0;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// Instantiate game client on page load
window.addEventListener('DOMContentLoaded', () => {
  window.arcadeGame = new ArcadeGameClient();
});
