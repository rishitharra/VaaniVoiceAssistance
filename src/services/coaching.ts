import contrasts from '../data/contrasts.json';
import { PHONE_INFO, type Phone } from './phonemes/inventory';
const pairs = contrasts as Record<string, {expected: string; observed: string; alternative: string}[]>;
export function contrastHint(word: string, expected: Phone, observed: Phone | null): string {
  if (!observed) return `The /${PHONE_INFO[expected].ipa}/ sound was not clear enough to hear. Listen before deciding.`;
  const pair = pairs[word.toLowerCase()]?.find(p => p.expected === expected && p.observed === observed);
  return pair ? `Your “${word}” may have leaned toward “${pair.alternative}”. Compare the clips before deciding.`
    : `The sound may have leaned toward /${PHONE_INFO[observed].ipa}/, as in “${PHONE_INFO[observed].example}”. Compare the clips before deciding.`;
}
export const WORD_NOTES: Record<string, string> = {
  comfortable: 'KUMF-ter-bul is a common American pronunciation; an extra unstressed syllable is also possible.',
  thirty: 'THUR-dee: many American speakers use a quick tongue tap for the t. Keep the opening th gentle.',
  would: 'The final d can share a closure with the next consonant in “would be”. Do not add a pause or extra vowel.',
  could: 'In “could bring”, the d may have no audible release. Keep the phrase flowing.',
  little: 'The middle t often becomes a quick tongue tap. Finish with the l sound.',
  world: 'Move smoothly from the r-colored vowel to l and d; avoid inserting another syllable.',
};
export const ARTICULATION: Record<Phone, string> = {
 AA:'Open your jaw; keep the tongue low and toward the back.', AE:'Open your mouth with the tongue low and toward the front.',
 AH:'Relax the jaw and tongue. Unstressed schwa is short and light.', AW:'Start open and glide toward rounded lips.', AY:'Start open and glide toward a high front tongue position.',
 B:'Close both lips, then release with voicing.', CH:'Touch behind the upper teeth, then release into a short sh sound.', D:'Touch the ridge behind the upper teeth with the tongue tip; release with voicing.',
 DH:'Touch the tongue tip lightly to the upper teeth and let voiced air flow.', DX:'Tap the ridge behind the upper teeth very briefly, as in American water.',
 EH:'Keep the jaw moderately open and the tongue toward the front.', ER:'Draw the tongue back or bunch it without touching the roof; keep voicing.', EY:'Glide from a mid-front vowel toward a higher tongue position.',
 F:'Touch the lower lip lightly to the upper teeth and blow without voicing.', G:'Raise the back of the tongue to the soft palate, then release with voicing.', HH:'Let gentle air flow through an open throat into the next vowel.',
 IH:'Relax the lips and keep the tongue high and forward, slightly lower than ee.', IY:'Keep the tongue high and forward with relaxed, spread lips.', JH:'Touch behind the upper teeth, then release into a voiced zh sound.', K:'Raise the back of the tongue to the soft palate and release without voicing.',
 L:'Touch the tongue tip to the ridge behind the upper teeth. At word endings, raise the tongue back too; do not let dark l vanish.', M:'Close both lips and hum through the nose.', N:'Touch the tongue tip behind the upper teeth and hum through the nose.', NG:'Raise the tongue back to the soft palate and hum; do not add a g release.',
 OW:'Glide from a mid-back vowel toward gently rounded lips.', OY:'Start with rounded lips, then glide toward a high front tongue position.', P:'Close both lips, then release without voicing.', R:'Bunch or curl the tongue without touching the roof. Keep the sides near the upper back teeth.',
 S:'Bring the tongue near the ridge behind the upper teeth; send air down the middle without voicing.', SH:'Round the lips slightly and move the tongue just behind the s position.', T:'Touch the ridge behind the upper teeth, then release without voicing. Natural connected speech may soften the release.', TH:'Place the tongue tip lightly at the upper teeth and let air flow without voicing.',
 UH:'Round the lips gently; keep the tongue high and back but relaxed.', UW:'Round the lips and raise the tongue toward the back.', V:'Touch the lower lip to the upper teeth and keep the voice vibrating.', W:'Round both lips without touching the upper teeth, then glide into the vowel.', Y:'Raise the tongue toward the hard palate and glide into the vowel.', Z:'Use the s tongue position with voice vibrating.'
};
