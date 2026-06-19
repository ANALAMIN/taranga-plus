var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/electron/index.js
var require_electron = __commonJS({
  "node_modules/electron/index.js"(exports, module) {
    var { spawnSync } = __require("child_process");
    var fs = __require("fs");
    var path = __require("path");
    var pathFile = path.join(__dirname, "path.txt");
    function downloadElectron() {
      console.log("Downloading Electron binary...");
      const result = spawnSync(process.execPath, [path.join(__dirname, "install.js")], {
        stdio: "inherit"
      });
      if (result.status !== 0) {
        throw new Error(
          'Electron failed to install correctly. Please delete `node_modules/electron` and run "npx install-electron --no" manually.'
        );
      }
    }
    function getElectronPath() {
      let executablePath;
      if (fs.existsSync(pathFile)) {
        executablePath = fs.readFileSync(pathFile, "utf-8");
      }
      if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
        return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || "electron");
      }
      if (executablePath) {
        const fullPath = path.join(__dirname, "dist", executablePath);
        if (!fs.existsSync(fullPath)) {
          downloadElectron();
        }
        return fullPath;
      } else {
        try {
          downloadElectron();
        } catch {
          throw new Error(
            'Electron failed to install correctly. Please delete `node_modules/electron` and run "npx install-electron --no" manually.'
          );
        }
        executablePath = fs.readFileSync(pathFile, "utf-8");
        return path.join(__dirname, "dist", executablePath);
      }
    }
    module.exports = getElectronPath();
  }
});

// ui/electron-main/hardware/gpuAccel.ts
var import_electron = __toESM(require_electron(), 1);
function setupGpuAcceleration() {
  import_electron.app.commandLine.appendSwitch("enable-gpu-rasterization");
  import_electron.app.commandLine.appendSwitch("enable-zero-copy");
  import_electron.app.commandLine.appendSwitch("ignore-gpu-blocklist");
  import_electron.app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,VaapiVideoEncoder");
}
export {
  setupGpuAcceleration
};
