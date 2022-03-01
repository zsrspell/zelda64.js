Zelda64.js
==========

*Zelda64.js* is a JavaScript library written in TypeScript. It is a port of the
[OoTRandomizer](https://ootrandomizer.com) ZPF patcher and a port of the Zelda64 
Compressor and Decompressor programs all rolled up into a single library.

The library only depends on the existence of the `ArrayBuffer` API and its related
views like `DataView` and `Uint8Array`. It also uses the 
[Pako](https://github.com/nodeca/pako) library for deflating the ZPF patch file.

How To Use
----------

You can import Zelda64.js with your package manager of choice. To install it with
NPM simply execute:

```shell
$ npm install zelda64
```

How To Build
------------

To build *Zelda64.js* you need to have [NodeJS](https://nodejs.org) installed, 
only the latest version of NodeJS has been tested. With NodeJS installed, run the 
following from the repository root:

```shell
$ npm install 
$ npm run build
```

The built JavaScript files and their TypeScript definitions can be found in the `dist` 
folder.

Performance
-----------

Careful attention was paid to the performance of *Zelda64.js*. While more extensive
benchmarks are needed, initial tests show the decompressor and patcher to be
significantly faster (around 200% to 300%) than their reference implementations. The
compressor is marginally faster than the reference implementations on the first run,
however, *Zelda64.js* does not yet implement caching the compression results and thus
subsequent runs can take significantly longer.

