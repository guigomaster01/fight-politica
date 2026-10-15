# ⚔️ POLÍTICA FIGHT: 13 vs 22 (Arcade Battle)

Um jogo de batalha arcade em estilo **Pixel Art 16-bit** com matchmaking em tempo real via WebSockets.

---

## 🎮 Como Funciona

1. **Escolha de Personagem**:
   - **Personagem 13** (*O Companheiro 13*): Mestre da resistência com visual pixel art clássico, quimono vermelho e insígnia da estrela.
   - **Personagem 22** (*O Capitão 22*): Lutador disciplinado com visual pixel art nas cores patrióticas verde e amarelo.

2. **Matchmaking em Tempo Real**:
   - Se você escolher o **Personagem 22**, o sistema entra na fila e aguarda o próximo usuário que escolher o **Personagem 13**.
   - Assim que dois jogadores de lados opostos entram na fila, a batalha inicia instantaneamente!
   - **Entrada Automática do Bot (8 segundos)**: Se nenhum oponente humano entrar na fila em até 8 segundos, o jogo inicia a batalha automaticamente contra o Bot IA.
   - Há também o botão **"Enfrentar Bot Agora"** para pular a espera e lutar imediatamente.

3. **Sistema de Combate e HP (0 a 100)**:
   - Cada personagem possui uma barra de vida de **0 a 100 HP**.
   - Transição dinâmica de cores (Verde → Amarelo → Vermelho) com barra fantasma de dano atrasada (estilo Street Fighter).
   - Medidor de Especial (0 a 100%) que carrega com ataques desferidos e recebidos.
   - Detecção de K.O. e tela de vitória quando o HP atinge 0.

---

## 🕹️ Controles

| Ação | Tecla | Efeito |
| :--- | :---: | :--- |
| **Soco Rápido** | `J` ou `1` | Dano de 8 a 12 (recarga rápida de 400ms) |
| **Golpe Forte** | `K` ou `2` | Dano de 14 a 19 (recarga de 900ms) |
| **Defender** | `L` ou `3` (segurar) | Reduz o dano recebido em 70% |
| **Golpe Especial** | `ESPAÇO` ou `Enter` | Dano devastador de 28 a 35 com efeito visual (requer 100% de Especial) |
| **Provocar (Taunt)** | `T` | Balão de diálogo retrô com falas temáticas |

*Também possui botões touch interativos no rodapé para jogar pelo celular ou mouse!*

---

## 🚀 Como Iniciar

1. Instalar dependências (já instaladas):
   ```bash
   npm install
   ```

2. Iniciar o servidor:
   ```bash
   npm start
   ```

3. Abrir no navegador:
   ```
   http://localhost:3000
   ```

> **Dica para testar Multiplayer**: Abra duas abas (ou uma aba normal e uma anônima) em `http://localhost:3000`. Em uma aba escolha o **13** e na outra escolha o **22**. O pareamento acontecerá automaticamente!
