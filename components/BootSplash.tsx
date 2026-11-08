/**
 * BRAND-T02 / D-237 — Abertura do EOS.
 *
 * O O gira no próprio plano, como um botão de volume — esquerda → centro →
 * direita → centro — enquanto o app carrega. Quando o documento está pronto,
 * ele termina a volta no centro, o E e o S saem de trás dele e a abertura some.
 *
 * Por que é HTML + CSS + um script inline, e não um componente cliente:
 * um componente cliente só aparece DEPOIS que o JavaScript do app baixa e
 * hidrata — exatamente o tempo que a abertura existe para cobrir. Aqui a
 * marcação vem no primeiro HTML e o giro começa antes de qualquer bundle.
 *
 * D-238: no iPhone a tela branca antes da abertura era o tempo do servidor
 * (start_url "/" → login no Supabase → redirect → /dashboard). Agora o ícone
 * abre `/abrir`, uma página estática; a abertura roda ali enquanto o app vai
 * para a tela certa por navegação de cliente, e só sai quando ela chega.
 *
 * Regras (D-237):
 * - Nunca bloqueia: some sozinha mesmo sem JavaScript ou se o
 *   script falhar (animação de segurança no CSS, 11 s). Um toque pula.
 * - Uma vez por sessão. Recarregar a página não repete a abertura.
 * - Não aparece em telas públicas que alguém abre numa emergência — a ficha
 *   (`/ficha/…`), o Sinal compartilhado e as páginas legais.
 * - `prefers-reduced-motion`: sem giro; a marca aparece inteira e some.
 *
 * O script só mexe em atributos do próprio `#eos-boot` (protegido com
 * `suppressHydrationWarning`) e em animações (Web Animations), que não são
 * atributos — nada que o React compare na hidratação.
 */

const E = 'M 40,0 L 150,0 L 126,24 L 26,24 L 26,48 L 100,48 L 100,72 L 26,72 L 26,96 L 120,96 L 120,120 L 0,120 L 0,40 Z'
const O = 'M 30,0 L 120,0 L 120,90 L 90,120 L 0,120 L 0,30 Z M 41.4,24 L 94,24 L 94,80.6 L 78.6,96 L 26,96 L 26,39.4 Z'
const S = 'M 30,0 L 120,0 L 120,24 L 26,24 L 26,48 L 120,48 L 120,90 L 90,120 L -30,120 L -6,96 L 94,96 L 94,72 L 0,72 L 0,30 Z'

/**
 * Uma volta: 4 trechos de 600 ms (o ritmo que o dono aprovou na prévia).
 * O ponto de parada é o fim do 3º trecho (direita → centro). Como o giro
 * começa na esquerda, a primeira parada possível é em 1,8 s: a sequência
 * esquerda → centro → direita → centro sempre aparece inteira (D-238).
 */
const CYCLE_MS = 2400
const STOP_AT_MS = 1800
/** Logo inteiro na tela antes de sumir. */
const HOLD_MS = 1700
/** Na rota de abertura (`/abrir`), espera o app trocar de tela por no máximo isto. */
const MAX_HOLD_ROUTE_MS = 6000

const css = `
#eos-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;
  background:var(--bg,#0a0a0f);cursor:pointer;
  animation:eos-boot-failsafe .3s ease-out 11s forwards}
#eos-boot[hidden]{display:none!important}
#eos-boot .eb-lockup{width:min(62vw,300px)}
#eos-boot .eb-mark{position:relative;width:100%;aspect-ratio:438/120}
#eos-boot .eb-mark svg{position:absolute;top:0;height:100%;overflow:visible;display:block}
#eos-boot .eb-e{left:${(30 / 438) * 100}%;width:${(150 / 438) * 100}%;z-index:1;opacity:0}
#eos-boot .eb-o{left:${(174 / 438) * 100}%;width:${(120 / 438) * 100}%;z-index:2;
  transform-origin:50% 50%;animation:eos-boot-knob ${CYCLE_MS}ms linear infinite}
#eos-boot .eb-s{left:${(288 / 438) * 100}%;width:${(150 / 438) * 100}%;z-index:1;opacity:0}
#eos-boot .eb-desc{margin:8% 0 0 ${(30 / 438) * 100}%;opacity:0;white-space:nowrap;
  font-family:'DM Mono',ui-monospace,'SF Mono',monospace;font-weight:500;color:#f2f5f3;line-height:1.2;
  font-size:calc(min(62vw,300px) * .048);letter-spacing:calc(min(62vw,300px) * .0073);
  margin-right:calc(min(62vw,300px) * -.0073)}
@keyframes eos-boot-knob{
  0%{transform:rotate(-90deg);animation-timing-function:cubic-bezier(.65,0,.35,1)}
  25%{transform:rotate(0deg);animation-timing-function:cubic-bezier(.65,0,.35,1)}
  50%{transform:rotate(90deg);animation-timing-function:cubic-bezier(.65,0,.35,1)}
  75%{transform:rotate(0deg);animation-timing-function:cubic-bezier(.65,0,.35,1)}
  100%{transform:rotate(-90deg)}}
@keyframes eos-boot-failsafe{to{opacity:0;visibility:hidden;pointer-events:none}}
@media (prefers-reduced-motion:reduce){
  #eos-boot .eb-o{animation:none}
  #eos-boot .eb-e,#eos-boot .eb-s,#eos-boot .eb-desc{opacity:1}}
`

const script = `(function(){
var el=document.getElementById('eos-boot');if(!el)return;
function hide(){el.setAttribute('hidden','')}
var p=location.pathname;
var publico=/^\\/(ficha\\/|terms|privacy|refund|api\\/)/.test(p)||/\\/compartilhar(\\/|$)/.test(p);
var visto=false;try{visto=sessionStorage.getItem('eos-boot')==='1'}catch(e){}
if(publico||visto||!el.animate){hide();return}
try{sessionStorage.setItem('eos-boot','1')}catch(e){}
var reduz=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var o=el.querySelector('.eb-o'),e=el.querySelector('.eb-e'),s=el.querySelector('.eb-s'),d=el.querySelector('.eb-desc');
var fim=false;
function sair(){if(fim)return;fim=true;
  var a=el.animate([{opacity:1},{opacity:0}],{duration:reduz?1:260,easing:'ease-out',fill:'forwards'});
  a.onfinish=hide}
el.addEventListener('click',sair);
function revelar(){if(fim)return;
  var ease='cubic-bezier(.2,.8,.2,1)',dur=reduz?1:480;
  e.animate([{opacity:0,transform:'translateX(38%)'},{opacity:1,transform:'none'}],{duration:dur,easing:ease,fill:'forwards'});
  s.animate([{opacity:0,transform:'translateX(-38%)'},{opacity:1,transform:'none'}],{duration:dur,delay:reduz?0:60,easing:ease,fill:'forwards'});
  d.animate([{opacity:0,transform:'translateY(30%)'},{opacity:1,transform:'none'}],{duration:reduz?1:320,delay:reduz?0:420,easing:'ease-out',fill:'forwards'});
  setTimeout(sair,reduz?500:${HOLD_MS})}
function pronto(){if(fim)return;
  if(reduz){revelar();return}
  var anim=o.getAnimations?o.getAnimations()[0]:null;
  var t=anim&&typeof anim.currentTime==='number'?anim.currentTime:0;
  var espera=((${STOP_AT_MS}-(t%${CYCLE_MS}))+${CYCLE_MS})%${CYCLE_MS};
  setTimeout(function(){if(anim)anim.cancel();o.style.animation='none';revelar()},espera)}
var inicio=Date.now();
function quandoPronto(){
  if(location.pathname!=='/abrir'){pronto();return}
  var iv=setInterval(function(){
    if(location.pathname!=='/abrir'||Date.now()-inicio>${MAX_HOLD_ROUTE_MS}){clearInterval(iv);pronto()}
  },100)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',quandoPronto,{once:true});else quandoPronto();
})();`

export default function BootSplash() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <noscript>
        <style>{'#eos-boot{display:none!important}'}</style>
      </noscript>
      <div id="eos-boot" aria-hidden="true" suppressHydrationWarning>
        <div className="eb-lockup">
          <div className="eb-mark">
            <svg className="eb-e" viewBox="0 0 150 120">
              <path fill="#F2F5F3" d={E} />
            </svg>
            <svg className="eb-o" viewBox="0 0 120 120">
              <path fill="#00E5A0" fillRule="evenodd" d={O} />
            </svg>
            <svg className="eb-s" viewBox="-30 0 150 120">
              <path fill="#F2F5F3" d={S} />
            </svg>
          </div>
          <div className="eb-desc">EMERGENCY OPERATING SYSTEM</div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  )
}
