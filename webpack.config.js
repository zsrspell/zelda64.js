const path = require("path");

module.exports = {
    mode: "production",
    entry: path.resolve(__dirname, "src/index.ts"),
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "zelda64.js",
        library: {
            name: "Zelda64",
            type: "umd",
        },
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
                exclude: /node_modules/,
            }
        ]
    },
    resolve: {
        extensions: [".ts", "..."],
    }
}
