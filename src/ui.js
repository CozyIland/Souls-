// Menüs: Hauptmenü, Pause und die Zusammenfassung „Was Vargoth gelernt hat“.
import { isTouch } from './util.js';
import { mem, traits, capMem, saveMem, resetMemory } from './memory.js';
import { initAudio } from './audio.js';
import { G, startRound, prepareMenuScene, giveUp } from './game.js';

const $ = (id) => document.getElementById(id);

function showPlayUi(on) {
  $('menuBtn').style.display = on ? 'block' : 'none';
  $('touch').style.display = on && isTouch ? 'block' : 'none';
}

export function beginRound() {
  initAudio();
  startRound();
  try { if (document.activeElement) document.activeElement.blur(); } catch (e) { /* ignorieren */ }
  showPlayUi(true);
}

export function showMenu() {
  G.state = 'menu'; G.paused = false;
  prepareMenuScene();
  $('menu').classList.add('show');
  $('pause').classList.remove('show');
  showPlayUi(false);
  const info = $('memInfo');
  if (mem.rounds > 0) {
    info.textContent = `Vargoth erinnert sich an ${mem.rounds} Runde${mem.rounds === 1 ? '' : 'n'} gegen dich (${mem.wins} Siege, ${mem.losses} Niederlagen).`;
    $('resetBtn1').style.display = 'inline-block';
  } else {
    info.textContent = 'Er kennt dich noch nicht.';
    $('resetBtn1').style.display = 'none';
  }
}

export function togglePause() {
  if (G.state !== 'play' && G.state !== 'intro') return;
  G.paused = !G.paused;
  $('pause').classList.toggle('show', G.paused);
}

const ATK_NAMES = { slash: 'Klingenhieb', combo: 'Schlagkombo', sweep: 'Rundumschlag', charge: 'Ansturm', slam: 'Sprungschlag', orbs: 'Flammenkugeln' };

export function showSummary() {
  G.summaryShown = true;
  capMem(); saveMem();
  const before = G.startTraits, after = traits();
  const pct = (v) => Math.round(v * 100);
  const delta = (a, b) => {
    const d = Math.round((a - b) * 100);
    return d >= 3 ? `<span class="up">▲${d}</span>` : d <= -3 ? `<span class="dn">▼${-d}</span>` : '';
  };
  const side = after.lrBias > 0 ? 'rechts' : 'links';
  const items = [
    ['Verzögerte Schläge', after.feint, before.feint, `Du rollst im Schnitt bei ${pct(Math.min(after.avgFrac, 1.5))} % seiner Ausholbewegung. Je früher, desto öfter hält er den Schlag zurück.`],
    ['Liest deine Ausweichrichtung', Math.abs(after.aimSide), Math.abs(before.aimSide), mem.dir.left + mem.dir.right > 0 ? `Seitlich rollst du zu ${pct(Math.max(mem.dir.left, mem.dir.right) / (mem.dir.left + mem.dir.right))} % nach ${side} – er zielt dorthin.` : 'Noch keine seitlichen Rollen beobachtet.'],
    ['Längere Reichweite', after.back, before.back, `${pct(after.backShare)} % deiner Rollen gehen nach hinten – er setzt weiter nach.`],
    ['Bestraft Heilen', after.healPunish, before.healPunish, `Du heilst etwa ${after.healRate.toFixed(1)}× pro Minute. Er nutzt die Lücke zum Angriff.`],
    ['Konter bei Gier', after.greed, before.greed, `In ${pct(after.greedShare)} % seiner Erholungsphasen greifst du sofort an – er schiebt einen Konter ein.`],
    ['Schützt seinen Rücken', after.behind, before.behind, `Du verbringst ${pct(after.behindShare)} % der Zeit hinter ihm – mehr Rundumschläge.`],
    ['Jagt Fernkämpfer', after.far, before.far, `Dein Ø-Abstand: ${Math.round(after.avgDist)} – er stürmt öfter an und wirft Flammenkugeln.`],
    ['Nachbeben gegen Roll-Spam', after.rollSpam, before.rollSpam, `${after.rollRate.toFixed(0)} Rollen pro Minute – sein Sprungschlag verfolgt dich stärker und bebt nach.`],
  ];
  items.sort((x, y) => y[1] - x[1]);
  let html = G.result ? '<h2 class="win">FEIND BEZWUNGEN</h2>' : '<h2 class="dead">DU BIST GESTORBEN</h2>';
  html += `<div class="stats">Runde ${mem.rounds} · ${mem.wins} Siege · ${mem.losses} Niederlagen</div>`;
  html += `<p class="quote">„${G.result ? 'Du hast mich besiegt … doch ich habe von dir gelernt.' : 'Ich kenne dich jetzt ein wenig besser.'}"</p>`;
  html += '<div class="rule"></div><h3>Was Vargoth gelernt hat</h3>';
  for (const it of items) {
    html += `<div class="trait"><span class="n">${it[0]}</span><span class="v">${pct(it[1])} %${delta(it[1], it[2])}</span><div class="bar"><i style="width:${pct(it[1])}%"></i></div><span class="d">${it[3]}</span></div>`;
  }
  html += '<h3>Trefferquote seiner Angriffe</h3><table class="atkt">';
  for (const k in ATK_NAMES) {
    const e = after.eff[k];
    html += `<tr><td>${ATK_NAMES[k]}</td><td>${e.u >= 1 ? Math.round((e.h / e.u) * 100) + ' %' : '–'}</td></tr>`;
  }
  html += '</table><p class="sub" style="margin-top:10px;font-size:13px">Erfolgreiche Angriffe setzt er öfter ein, wirkungslose seltener.</p>';
  html += '<div class="rule"></div><button class="btn" id="nextBtn">Nächste Runde</button><br><button class="btn ghost" id="menuBack">Hauptmenü</button>';
  $('sumPanel').innerHTML = html;
  const ov = $('summary');
  ov.classList.add('show'); ov.scrollTop = 0;
  showPlayUi(false);
  $('nextBtn').onclick = () => { ov.classList.remove('show'); beginRound(); };
  $('menuBack').onclick = () => { ov.classList.remove('show'); showMenu(); };
}

export function setupUi() {
  $('startBtn').onclick = () => { $('menu').classList.remove('show'); beginRound(); };
  $('resetBtn1').onclick = () => { resetMemory(); showMenu(); };
  $('menuBtn').onclick = () => togglePause();
  $('resumeBtn').onclick = () => togglePause();
  $('restartBtn').onclick = () => {
    G.paused = false; $('pause').classList.remove('show');
    giveUp();
  };
  $('resetBtn2').onclick = () => { resetMemory(); G.paused = false; showMenu(); };
  if (isTouch) { $('ctrlKeys').style.display = 'none'; $('ctrlTouch').style.display = 'grid'; }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (G.state === 'play' || G.state === 'intro') && !G.paused) togglePause();
  });
}
