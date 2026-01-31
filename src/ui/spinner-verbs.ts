/**
 * Spinner Verbs Module
 * v2.1.23: 支持自定义 spinner 动词
 */

import { configManager } from '../config/index.js';
import type { ClaudeConfig } from '../types/config.js';

// 官方默认的 spinner verbs 列表 (从 @anthropic-ai/claude-code 提取)
export const DEFAULT_SPINNER_VERBS = [
  "Accomplishing", "Actioning", "Actualizing", "Architecting", "Baking",
  "Beaming", "Beboppin'", "Befuddling", "Billowing", "Blanching",
  "Bloviating", "Boogieing", "Boondoggling", "Booping", "Bootstrapping",
  "Brewing", "Burrowing", "Calculating", "Canoodling", "Caramelizing",
  "Cascading", "Catapulting", "Cerebrating", "Channeling", "Channelling",
  "Choreographing", "Churning", "Clauding", "Coalescing", "Cogitating",
  "Combobulating", "Composing", "Computing", "Concocting", "Considering",
  "Contemplating", "Cooking", "Crafting", "Creating", "Crunching",
  "Crystallizing", "Cultivating", "Deciphering", "Deliberating", "Determining",
  "Dilly-dallying", "Discombobulating", "Doing", "Doodling", "Drizzling",
  "Ebbing", "Effecting", "Elucidating", "Embellishing", "Enchanting",
  "Envisioning", "Evaporating", "Fermenting", "Fiddle-faddling", "Finagling",
  "Flambéing", "Flibbertigibbeting", "Flowing", "Flummoxing", "Fluttering",
  "Forging", "Forming", "Frolicking", "Frosting", "Gallivanting",
  "Galloping", "Garnishing", "Generating", "Germinating", "Gitifying",
  "Grooving", "Gusting", "Harmonizing", "Hashing", "Hatching",
  "Herding", "Honking", "Hullaballooing", "Hyperspacing", "Ideating",
  "Imagining", "Improvising", "Incubating", "Inferring", "Infusing",
  "Ionizing", "Jitterbugging", "Julienning", "Kneading", "Leavening",
  "Levitating", "Lollygagging", "Manifesting", "Marinating", "Meandering",
  "Metamorphosing", "Misting", "Moonwalking", "Moseying", "Mulling",
  "Mustering", "Musing", "Nebulizing", "Nesting", "Newspapering",
  "Noodling", "Nucleating", "Orbiting", "Orchestrating", "Osmosing",
  "Perambulating", "Percolating", "Perusing", "Philosophising", "Photosynthesizing",
  "Pollinating", "Pondering", "Pontificating", "Pouncing", "Precipitating",
  "Prestidigitating", "Processing", "Proofing", "Propagating", "Puttering",
  "Puzzling", "Quantumizing", "Razzle-dazzling", "Razzmatazzing", "Recombobulating",
  "Reticulating", "Roosting", "Ruminating", "Sautéing", "Scampering",
  "Schlepping", "Scurrying", "Seasoning", "Shenaniganing", "Shimmying",
  "Simmering", "Skedaddling", "Sketching", "Slithering", "Smooshing",
  "Sock-hopping", "Spelunking", "Spinning", "Sprouting", "Stewing",
  "Sublimating", "Swirling", "Swooping", "Symbioting", "Synthesizing",
  "Tempering", "Thinking", "Thundering", "Tinkering", "Tomfoolering",
  "Topsy-turvying", "Transfiguring", "Transmuting", "Twisting", "Undulating",
  "Unfurling", "Unravelling", "Vibing", "Waddling", "Wandering",
  "Warping", "Whatchamacalliting", "Whirlpooling", "Whirring", "Whisking",
  "Wibbling", "Working", "Wrangling", "Zesting", "Zigzagging"
];

/**
 * 获取 spinner verbs 列表
 * 支持用户自定义配置
 */
export function getSpinnerVerbs(): string[] {
  try {
    const config = configManager.getAll() as ClaudeConfig;
    const spinnerVerbs = config?.ui?.spinnerVerbs;

    if (!spinnerVerbs) {
      return DEFAULT_SPINNER_VERBS;
    }

    if (spinnerVerbs.mode === 'replace') {
      // replace 模式：只使用自定义 verbs
      return spinnerVerbs.verbs.length > 0 ? spinnerVerbs.verbs : DEFAULT_SPINNER_VERBS;
    }

    // append 模式：添加到默认列表
    return [...DEFAULT_SPINNER_VERBS, ...spinnerVerbs.verbs];
  } catch {
    return DEFAULT_SPINNER_VERBS;
  }
}

/**
 * 获取随机的 spinner verb
 */
export function getRandomSpinnerVerb(): string {
  const verbs = getSpinnerVerbs();
  return verbs[Math.floor(Math.random() * verbs.length)];
}
