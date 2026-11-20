// Menü (Start bzw. Esc, am Seelenstein): Reiter Charakter · Inventar · Steuerung · Test.
// Ganz mit dem Controller bedienbar: LB/RB Seite, Steuerkreuz/Stick auswählen, A bestätigen, B zurück. Maus/Touch: antippen.
import { STATS, MAX_LV, BASE, cost } from './stufe.js';

const TABS = ['char', 'inv', 'ctrl', 'test'];
const $ = (id) => document.getElementById(id);
const f0 = (x) => Math.round(x);

export class Menue {
  /** o = { werte, player, apply() (Werte übernehmen), jump(ort), reset() } */
  constructor(o) {
    this.o = o; this.tab = 'char'; this.atStone = false; this.focus = 0;
    for (const b of $('tabs').querySelectorAll('.tab')) b.onclick = () => this.setTab(b.dataset.tab);
  }
  open(tab = 'char', atStone = false) { this.atStone = atStone; this.focus = 0; this.setTab(tab); }
  setTab(t) { this.tab = t; this.focus = 0; this.render(); }

  /** auswählbare Knöpfe der aktuellen Seite (+ „Weiter“) */
  items() { return [...$('page-' + this.tab).querySelectorAll('.sbtn:not(:disabled)'), $('resumeBtn')]; }
  markFocus() {
    const it = this.items(); this.focus = Math.max(0, Math.min(it.length - 1, this.focus));
    for (const b of document.querySelectorAll('#pause .padFocus')) b.classList.remove('padFocus');
    if (it[this.focus]) { it[this.focus].classList.add('padFocus'); it[this.focus].scrollIntoView({ block: 'nearest' }); }
  }
  /** jedes Bild im Menü: gibt 'close' zurück, wenn es zugehen soll */
  update(inp) {
    if (inp.back || inp.pause) return 'close';
    if (inp.tab) { const i = (TABS.indexOf(this.tab) + inp.tab + TABS.length) % TABS.length; this.setTab(TABS[i]); return; }
    const step = inp.nav || inp.navX;
    if (step) { this.focus += step; this.markFocus(); }
    if (inp.confirm) { const b = this.items()[this.focus]; if (b) b.click(); }
  }

  render() {
    for (const b of $('tabs').querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === this.tab);
    for (const t of TABS) $('page-' + t).classList.toggle('on', t === this.tab);
    if (this.tab === 'char') this.renderChar();
    if (this.tab === 'inv') this.renderInv();
    if (this.tab === 'test') this.renderTest();
    this.markFocus();
  }

  renderChar() {
    const w = this.o.werte, m = w.mods(), lv = w.lv, next = w.next, can = this.atStone && w.canUp();
    const el = $('page-char');
    el.innerHTML = `
      <div class="mhead"><span class="lv">Stufe ${lv}</span><span class="sl">Seelen ${w.souls}</span></div>
      <p class="mnote gold">${lv >= MAX_LV ? 'Höchste Stufe erreicht.' : `Nächste Stufe: ${next} Seelen` + (w.souls < next ? ` (es fehlen ${next - w.souls})` : '')}</p>
      <p class="mnote">${this.atStone ? (can ? 'Wähle einen Wert, der um 1 steigt.' : 'Am Seelenstein – zu wenig Seelen für die nächste Stufe.') : 'Aufsteigen kannst du am Seelenstein am Anfang der Straße.'}</p>
      ${STATS.map((s) => `
        <div class="stat"><span class="ic">${s.icon}</span><span class="nm">${s.n}</span><span class="val">${w.s[s.k]}</span>
          ${this.atStone ? `<button class="sbtn" data-up="${s.k}" ${can ? '' : 'disabled'}>+1</button>` : '<span></span>'}
          <span class="ds">${s.d}</span></div>`).join('')}
      <div class="derived">
        <span>Leben</span><span>${m.maxHp}</span><span>Ausdauer</span><span>${m.maxSt}</span>
        <span>Degen leicht / schwer</span><span>${f0(12 * m.light)} / ${f0(32 * m.heavy)}</span>
        <span>Karte (Schaden · Ausdauer)</span><span>${f0(8 * m.card)} · ${f0(12 * m.cardCost)}</span>
        <span>Rolle kostet Ausdauer</span><span>${f0(22 * m.roll)}</span>
      </div>`;
    for (const b of el.querySelectorAll('[data-up]')) b.onclick = () => {
      if (w.levelUp(b.dataset.up)) { this.o.apply(); if (this.o.onLevel) this.o.onLevel(); }
      this.renderChar(); this.markFocus();
    };
  }

  renderInv() {
    const w = this.o.werte, m = w.mods(), p = this.o.player;
    const it = (icon, name, desc, qty, eq) => `<div class="item"><div class="ii">${icon}</div><div><div class="in">${name}${eq ? ' <span class="eq">AUSGERÜSTET</span>' : ''}</div><div class="id">${desc}</div></div><div class="iq">${qty}</div></div>`;
    $('page-inv').innerHTML = `
      <div class="mhead"><span class="lv">Inventar</span><span class="sl">Seelen ${w.souls}</span></div>
      ${it('⚔', 'Stockdegen', `Verborgene Klinge im Spazierstock. Schaden leicht ${f0(12 * m.light)}, schwer ${f0(32 * m.heavy)}.`, '', true)}
      ${it('🃏', 'Spielkarten', `Aus dem Mantel gezogen und geworfen. ${f0(8 * m.card)} Schaden je Karte, ${f0(12 * m.cardCost)} Ausdauer.`, '∞', true)}
      ${it('🧪', 'Heiltrank', 'Glut-Essenz im Fläschchen. Heilt 45 Leben. Am Seelenstein und nach dem Tod wieder voll.', `${p.potions} / ${p.maxPotions}`)}
      ${it('✦', 'Seelen', 'Von besiegten Gegnern (Hund 10, Boss 1500). Am Seelenstein gegen Stufen tauschen.', w.souls)}`;
  }

  renderTest() {
    const w = this.o.werte, el = $('page-test');
    el.innerHTML = `
      <div class="mhead"><span class="lv">Testmodus</span><span class="sl">Stufe ${w.lv} · Seelen ${w.souls}</span></div>
      <p class="mnote">Zum Ausprobieren: Stufe direkt einstellen (Punkte werden reihum verteilt) oder jeden Wert einzeln.</p>
      <div class="trow"><span class="tl">Stufe</span><button class="sbtn" data-lv="-1">−</button><span class="tv">${w.lv}</span><button class="sbtn" data-lv="1">+</button>
        <button class="sbtn" data-lv="-99">Stufe 1</button><button class="sbtn" data-lv="99">Stufe 20</button></div>
      ${STATS.map((s) => `<div class="trow"><span class="tl">${s.icon} ${s.n}</span><button class="sbtn" data-b="${s.k}" data-d="-1">−</button><span class="tv">${w.s[s.k]}</span><button class="sbtn" data-b="${s.k}" data-d="1">+</button></div>`).join('')}
      <div class="trow"><span class="tl">Unverwundbar</span><button class="sbtn" data-god="1">${w.god ? 'AN – ausschalten' : 'AUS – einschalten'}</button></div>
      <div class="trow"><span class="tl">Seelen</span><button class="sbtn" data-s="100">+100</button><button class="sbtn" data-s="1000">+1000</button><button class="sbtn" data-s="0">auf 0</button></div>
      <div class="trow"><span class="tl">Springen</span><button class="sbtn" data-j="stone">Zum Seelenstein</button><button class="sbtn" data-j="gate">Vor das Nebeltor</button><button class="sbtn" data-j="arena">In die Arena</button></div>
      <div class="trow"><span class="tl">Neu</span><button class="sbtn" data-r="1">Alles zurücksetzen</button></div>
      <p class="mnote">Kosten: ${Array.from({ length: MAX_LV - 1 }, (_, i) => `${i + 2}: ${cost(i + 2)}`).join(' · ')}</p>`;
    const re = () => { this.o.apply(); this.renderTest(); this.markFocus(); };
    for (const b of el.querySelectorAll('[data-lv]')) b.onclick = () => { w.setLevel(w.lv + Number(b.dataset.lv)); re(); };
    for (const b of el.querySelectorAll('[data-b]')) b.onclick = () => { w.bump(b.dataset.b, Number(b.dataset.d)); re(); };
    for (const b of el.querySelectorAll('[data-s]')) b.onclick = () => { const n = Number(b.dataset.s); if (n) w.addSouls(n); else { w.souls = 0; w.save(); } re(); };
    for (const b of el.querySelectorAll('[data-j]')) b.onclick = () => { this.o.jump(b.dataset.j); };
    for (const b of el.querySelectorAll('[data-god]')) b.onclick = () => { w.god = !w.god; w.save(); re(); };
    for (const b of el.querySelectorAll('[data-r]')) b.onclick = () => { w.reset(); w.save(); if (this.o.reset) this.o.reset(); re(); };
  }
}
export { BASE };
