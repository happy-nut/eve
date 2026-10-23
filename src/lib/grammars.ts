// the highlighter with lowlight's 37 common grammars and a few more people write notes in (a Dockerfile drew plain),
// split from the app's start (code.ts loads it)
import { common, createLowlight } from 'lowlight';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import powershell from 'highlight.js/lib/languages/powershell';
import nginx from 'highlight.js/lib/languages/nginx';
import scala from 'highlight.js/lib/languages/scala';
import dart from 'highlight.js/lib/languages/dart';
import haskell from 'highlight.js/lib/languages/haskell';
import elixir from 'highlight.js/lib/languages/elixir';
import protobuf from 'highlight.js/lib/languages/protobuf';
import groovy from 'highlight.js/lib/languages/groovy';
import cmake from 'highlight.js/lib/languages/cmake';

export const lowlight = createLowlight({ ...common, dockerfile, powershell, nginx, scala, dart, haskell, elixir, protobuf, groovy, cmake });
