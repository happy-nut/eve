// the highlighter with lowlight's 37 common grammars, split from the app's start (code.ts loads it)
import { common, createLowlight } from 'lowlight';

export const lowlight = createLowlight(common);
