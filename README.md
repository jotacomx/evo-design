# EVO Design Racing — Experiência 3D

Landing page imersiva em **Three.js + GSAP ScrollTrigger + Lenis**, inspirada no conceito
do site de referência (Peach Worlds "Passion - 3D Web Agency"): câmera cinematográfica
controlada pelo scroll, smooth scroll com inércia, reveals coreografados e estética dark.

A peça 3D central é um **volante de F1 modelado proceduralmente** (sem precisar de arquivo externo).

## Estrutura

```
evo-3d/
├── index.html        # marcação + seções/conteúdo + CDNs
├── css/styles.css    # estilos (dark, responsivo, reduced-motion)
└── js/main.js        # cena 3D, volante, scroll cinematográfico
```

Tudo carrega via CDN (Three.js por importmap, GSAP e Lenis por <script>). **Não precisa de build/npm.**

## Como rodar localmente

Precisa de um servidor HTTP (os módulos ES não funcionam abrindo o arquivo direto via `file://`).

**Opção 1 — Python (já vem no Windows/macOS):**
```bash
cd evo-3d
python -m http.server 8000
```
Abra http://localhost:8000

**Opção 2 — Node:**
```bash
npx serve evo-3d
```

**Opção 3 — VS Code:** extensão *Live Server* → botão "Go Live".

## Como publicar (arquivos estáticos)

Suba a pasta `evo-3d/` inteira para qualquer host estático:

- **Netlify:** arraste a pasta em app.netlify.com/drop → no ar em segundos.
- **Vercel:** `npx vercel` na pasta, ou conecte um repositório.
- **Cloudflare Pages / GitHub Pages:** suba o conteúdo da pasta.
- **Hospedagem/cPanel:** envie os arquivos para `public_html` (ou um subdomínio, ex.: `experiencia.evodesignracing.com.br`).

> Como o site WordPress atual usa Elementor, o caminho recomendado é publicar esta
> experiência em um **subdomínio** e usá-la como página de entrada/landing, mantendo
> o WordPress para catálogo/checkout.

## Trocar o volante por um cockpit 3D real (.glb)

1. Coloque o modelo em `assets/cockpit.glb` (otimizado: < 5 MB, Draco de preferência).
2. Em `js/main.js`, no fim da seção 5b, descomente:
   ```js
   carregarGLB('assets/cockpit.glb');
   ```
   O código centraliza e escala o modelo automaticamente.

Onde achar modelos: Sketchfab (filtre por licença **CC** / comercial), ou exporte do Blender.
Para comprimir: `npx @gltf-transform/cli optimize in.glb out.glb --compress draco`.

## Ajustes rápidos

- **Trajeto da câmera:** array `steps` em `js/main.js` (posição, ponto observado e rotação do volante por seção).
- **Cores da marca:** variáveis `--evo`, `--accent` em `css/styles.css`.
- **Textos/preços/links:** direto no `index.html` (CTAs já apontam pro WhatsApp da EVO).

## Acessibilidade / robustez

- Detecta ausência de **WebGL** e mostra fallback com CTA.
- Respeita **prefers-reduced-motion** (desliga o scroll cinematográfico).
- DPR e contagem de partículas reduzidos no **mobile**.
