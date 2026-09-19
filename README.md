# ALICE

**A local GPU companion stack: character card, llama.cpp, keyed memory, Discord, and a VRM that can sit on your desktop.**

No cloud chat API. You bring a GGUF, a JSON persona, and (optionally) a VRM. The rest is a one-click Windows launcher.

This public tree ships an example card (`characters/character.json`, name **Mira**). Replace her. She is not the point.

## Punch line

Edit a character sheet. Offload Eclipse 12B to your NVIDIA GPU. Talk in the terminal, in Discord, or through a sit-on-the-desk overlay — with memory isolated per person so strangers never inherit the owner's bond.

## Prerequisites (Windows)

| Piece | Why | Notes |
| --- | --- | --- |
| Windows 10/11 x64 | Scripts are PowerShell | Run them from the repo root. |
| Git | llama.cpp + Utsuwa | |
| [Visual Studio 2022](https://visualstudio.microsoft.com/vs/) with **Desktop development with C++** | Build llama.cpp (and Tauri overlay) | Build Tools SKU is enough. |
| [CMake](https://cmake.org/download/) 3.28+ | llama.cpp configure | Tick "Add CMake to PATH". |
| [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) 12.x | GPU inference | Install, then set `CUDA_PATH` if `nvcc` is not on PATH. |
| NVIDIA GPU + recent Game Ready / Studio driver | Weights live in VRAM | See VRAM below. |
| [Python 3.11+](https://www.python.org/downloads/) | Hugging Face GGUF download | `pip install huggingface_hub` |
| [Node.js 22+](https://nodejs.org/) | Utsuwa UI + Discord bot | Corepack/pnpm is used for Utsuwa. |
| Rust (rustup) | Only for `scripts\13-utsuwa-desktop.ps1` | Browser overlay works without it. |

Optional: Discord bot token + your user snowflake if you want the Discord front.

### VRAM (what to expect)

Default model is **KansenSakura Eclipse RP 12B Q4_K_M** (~**7.0 GiB** on disk).

Scripts offload every layer (`-ngl 99`), use **8k** context, and quantize the KV cache to `q8_0`.

| Setup | Rough VRAM | What you can do |
| --- | --- | --- |
| **8 GB** | Tight | Close browsers / other CUDA apps. Prefer park-brain (`scripts\11-park-brain.ps1`) while the overlay only sits. Chat may OOM. |
| **10–12 GB** | Typical | Full Eclipse chat + Utsuwa in a browser. Comfortable if nothing else is hogging the GPU. |
| **16 GB+** | Easy | Chat, overlay, Discord, and a browser on the same GPU. |

Utsuwa / VRM rendering is small next to the LLM (hundreds of MB, not gigabytes). The spike is **weights + KV cache**. If Windows reports free VRAM under ~8 GB before `scripts\04-serve.ps1`, close GPU-heavy apps first. `scripts\06-probe-gpu.ps1` prints `nvidia-smi` and llama.cpp device lists.

Build `CMAKE_CUDA_ARCHITECTURES` if the default fatbin is wrong for your card:

| GPU generation | Example cards | Set this |
| --- | --- | --- |
| Ampere | RTX 30 | `86` |
| Ada | RTX 40 | `89` |
| Blackwell | RTX 50 | `120` |

```powershell
$env:CMAKE_CUDA_ARCHITECTURES = "89"   # example: RTX 40
.\scripts\01-build-llama.ps1
```

Default configure tries `86;89;120` so one binary covers those three.

## Startup

### 1. Clone this repo

Do not copy a private character card, `.env`, or `avatars/*.vrm` into a public fork.

### 2. Fetch Utsuwa, then re-apply this repo's overlay

Utsuwa is [JuiceBoxxGames/utsuwa](https://github.com/JuiceBoxxGames/utsuwa) (AGPL-3.0). This repo tracks the companion overlay, memory, and llama.cpp wiring on top of it.

```powershell
.\scripts\00-fetch-utsuwa.ps1
```

### 3. CUDA + llama.cpp

```powershell
# nvcc should exist. If not:
#   $env:CUDA_PATH = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8"
.\scripts\01-build-llama.ps1
.\scripts\06-probe-gpu.ps1
```

### 4. Download the GGUF (~7 GiB, once)

```powershell
.\scripts\02-download-gguf.ps1
```

Needs network. The file lands in `models/eclipse-12b/` (gitignored).

### 5. Edit the character sheet

Open [`characters/character.json`](characters/character.json).

| Field | Meaning |
| --- | --- |
| `name` | Companion name (example: Mira). |
| `user_name` | Owner display name. Must match how you want to be addressed. |
| `tagline` / `appearance` / `personality` / `background` / `speech` / `scenario` | Prompt ingredients. |
| `rules` | Hard constraints (voice length, stranger vs owner, 18+). |
| `example_dialogue` | Style only; the model should not copy it verbatim. |

Then set the owner identity used by memory + Discord:

[`config/identity.json`](config/identity.json)

- `ownerName` — same as `user_name` in the card
- `ownerMemoryKey` — keep `person/owner` unless you know you want another key
- `characterKey` — keep `character/example` unless you rename the card id in code

Re-render the ChatML system prompt whenever the card changes:

```powershell
.\scripts\render-persona.ps1
```

### 6. Env keys (Discord, optional)

```powershell
copy .env.example .env
```

| Variable | Required | What it is |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | For Discord | Bot token from the Discord developer portal. Never commit `.env`. |
| `OWNER_DISCORD_ID` | For Discord | Your user snowflake. That account is the owner / `person/owner`. |
| `LLAMA_URL` | No | Override chat-completions URL (default `http://127.0.0.1:8081/v1/chat/completions`). |
| `CUDA_PATH` | If nvcc is not default | CUDA toolkit root. |
| `CMAKE_CUDA_ARCHITECTURES` | If build fails | GPU arch, e.g. `89`. |

No OpenAI / Anthropic keys. Inference is local llama.cpp.

### 7. Launch

```powershell
# Terminal RP only
.\scripts\03-chat.ps1

# Or the full loop: llama.cpp + Utsuwa + optional Discord
.\Start-ALICE.bat
# same as: .\scripts\08-start-companion.ps1
```

The launcher asks whether to start Discord. Type `skip` to leave it off.

Browser UI: `http://localhost:5173/app`  
llama.cpp API: `http://127.0.0.1:8081/v1`

Desktop overlay (Rust/Tauri, extra first-time compile):

```powershell
.\scripts\13-utsuwa-desktop.ps1
```

Park Eclipse to free VRAM while the overlay only sits:

```powershell
.\scripts\11-park-brain.ps1
.\scripts\12-wake-brain.ps1          # chat again
.\scripts\12-wake-brain.ps1 -Discord
```

## Layout

```
characters/character.json   example persona — edit this
config/identity.json        owner memory key
config.ps1                  paths, sampler, default 8k ctx
scripts/                    numbered Windows setup + launcher
src/memory/                 hierarchical person keys
discord/                    bot front
avatars/                    put character.vrm here (not committed)
vendor/llama.cpp            built locally, gitignored
vendor/utsuwa               Utsuwa + overlay files
models/                     GGUF, gitignored
```

## License notes

- Utsuwa is AGPL-3.0-or-later; keep that in mind if you distribute a combined build.
- The example character is original sample text, not an anime IP.
- Ship only VRMs you made, commissioned, or have a license to use.
