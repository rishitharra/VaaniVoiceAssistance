import { validateSave } from '../src/services/saveValidation';
import assert from 'node:assert/strict';
import { alignWords } from '../src/services/engine/align';
import { decidePhones } from '../src/services/engine/decide';
import { classifySounds } from '../src/services/engine/classify';
import { isClearReading } from '../src/services/engine/evidence';
import { tokenizeText } from '../src/services/phonemes/lexicon';
import { contrastHint, ARTICULATION } from '../src/services/coaching';
import { CANON, type Phone } from '../src/services/phonemes/inventory';
import { applySession, newProfile } from '../src/services/profile';
import type { AnalysisResult, RecognizedPhone } from '../src/services/engine/types';
import { buildPracticeSet } from '../src/services/sentenceSelector';

let count = 0;
function check(name: string, fn: () => void) { fn(); count++; console.log('PASS', name); }
function simulate(text: string, omit?: (word: string, phone: Phone) => boolean) {
  const expected = tokenizeText(text);
  const rec: RecognizedPhone[] = [];
  for (const w of expected) for (const p of w.variants[0]) {
    if (omit?.(w.key, p.phone)) continue;
    const t = rec.length * 0.08;
    rec.push({phone: p.phone, token:p.phone, start:t, end:t+0.08, confidence:0.95});
  }
  const words = alignWords(expected, rec);
  decidePhones({words,textWords:expected,primary:words.map(w => w.phones.map(p => ({gop:p.observed ? 3 : -8,alt:null})))});
  return {words,rec};
}
const clean = (): AnalysisResult => {
  const {words,rec} = simulate('Think through three thick threads before Thursday.');
  return {text:'',words,recognized:rec,sounds:classifySounds(words),scores:words.flatMap(w=>w.phones.map(p=>({phone:p.expected,gop:p.gop ?? NaN}))),audio:new Float32Array(16000),sampleRate:16000,durationSec:5,quality:{snrDb:25,clippedRatio:0},modelId:'synthetic',createdAt:1};
};
check('continuous speech needs no gaps', () => assert(simulate('I would be glad to help.').words.every(w=>w.status==='ok')));
check('would be missing d is uncertain, not a hard error', () => assert.equal(simulate('I would be glad to help.',(w,p)=>w==='would'&&p==='D').words.find(w=>w.text==='would')!.phones.at(-1)!.status,'uncertain'));
check('isolated final d stays assessable', () => assert.equal(simulate('I would.',(w,p)=>w==='would'&&p==='D').words.at(-1)!.phones.at(-1)!.status,'error'));
check('missing words never become matched through GOP', () => assert(simulate('Think through three thick threads.',w=>w==='thick').words.find(w=>w.text==='thick')!.phones.every(p=>p.status==='uncertain')));
check('empty input is safe', () => assert.deepEqual(alignWords([],[]),[]));
check('clear evidence qualifies', () => assert(isClearReading(clean())));
check('uncertain evidence does not qualify', () => { const r=clean(); r.words.forEach(w=>w.phones.forEach(p=>p.status='uncertain')); assert(!isClearReading(r)); });
check('clipped recording does not qualify', () => {const r=clean();r.quality.clippedRatio=.02;assert(!isClearReading(r));});
check('low contrast recording does not qualify', () => {const r=clean();r.quality.snrDb=2;assert(!isClearReading(r));});
check('clear reading unlocks random practice persistently', () => {const p=applySession(newProfile(),clean(),{},[]);assert(p.randomPracticeUnlocked); const r=clean();r.quality.snrDb=0;assert(applySession(p,r,{},[]).randomPracticeUnlocked);});
check('uncertain reading cannot unlock',()=>{const r=clean();r.words[0].timingEstimated=true;assert(!applySession(newProfile(),r,{},[]).randomPracticeUnlocked);});
check('disagreed sound does not enter calibration',()=>{const r=clean();r.scores=[{phone:'TH',gop:-5}];assert.equal(applySession(newProfile(),r,{TH:'disagree'},[]).gopStats?.TH,undefined);});
check('uncertainty resets clean streak',()=>{const p=newProfile();p.weakSounds.TH={phone:'TH',status:'active',confirmations:1,cleanStreak:1,firstConfirmedAt:1,lastConfirmedAt:1};const r=clean();r.sounds.find(s=>s.phone==='TH')!.status='uncertain';assert.equal(applySession(p,r,{},[]).weakSounds.TH!.cleanStreak,0);});
check('dictionary gives think/sink',()=>assert(contrastHint('think','TH','S').includes('sink')));
check('dictionary gives vest/west',()=>assert(contrastHint('vest','V','W').includes('west')));
check('unknown contrast uses honest sound fallback',()=>assert(!contrastHint('xyz','TH','S').includes('leaned toward “')));
check('all supported sounds have articulation text',()=>CANON.forEach(p=>assert(ARTICULATION[p])));
check('random practice avoids recent sentences',()=>{const a=buildPracticeSet([]);const b=buildPracticeSet([],a.sentenceIds);assert(!b.sentenceIds.some(id=>a.sentenceIds.includes(id)));});
check('old valid profile imports without unlock field',()=>validateSave({app:'vaani',version:1,profile:newProfile(),sessions:[]}));
check('malformed import is rejected before writes',()=>assert.throws(()=>validateSave({app:'vaani',version:1,profile:{id:'x'},sessions:[]})));
check('unknown sound import is rejected',()=>{const p=newProfile();(p.weakSounds as any).XYZ={};assert.throws(()=>validateSave({app:'vaani',version:1,profile:p,sessions:[]}));});
check('second-model disagreement stays uncertain',()=>{const r=clean(); const expected=tokenizeText('Think through three thick threads before Thursday.'); decidePhones({words:r.words,textWords:expected,primary:r.words.map(w=>w.phones.map(()=>({gop:3,alt:null}))),alt:r.words.map(w=>w.phones.map(()=>({gop:-4,alt:null})))});assert(r.words.every(w=>w.phones.every(p=>p.status==='uncertain')));});
console.log(`${count} regression checks passed.`);
