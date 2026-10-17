// Compiles Paraglide messages outside Vite (typecheck, CI) with the same options as the plugin.
import { compile } from "@inlang/paraglide-js";
import { paraglideOptions } from "../paraglide.config.ts";

await compile(paraglideOptions);
