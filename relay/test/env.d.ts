// Types `exports` from "cloudflare:workers" after the relay's own exports.
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("../src/index");
  }
}
