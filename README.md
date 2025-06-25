# easybase 🚀

> **A simple wrapper around Autobase that makes pairing and sharing easy, with configurable actions for handling custom operations**

⚠️ **Work in Progress** - This package is still under active development. APIs may change and features may be added or modified.

---

## Installation

### 1. Install via Git (Recommended for now)

You can install this package directly from the Git repository:

```bash
bun add github:Drache93/easybase
# or
npm install git+https://github.com/Drache93/easybase.git
```

- To install a specific version (tag):
  ```bash
  bun add github:Drache93/easybase#v1.0.0
  # or
  npm install git+https://github.com/Drache93/easybase.git#v1.0.0
  ```

### 2. Build Output

- The `build/` directory contains compiled JavaScript and TypeScript declaration files.
- If you are installing from Git and do **not** see a `build/` directory, run:
  ```bash
  bun run build && bun run build:types
  ```
- TypeScript users will get full type support automatically.

---

## Usage

### TypeScript

```typescript
import { Easybase, EasybasePairer, type EasybaseOptions } from "easybase";
```

### JavaScript

```js
import { Easybase } from "easybase";
```

---

## Features ✨

- **Simple Pairing** 🔗: Easy invite-based pairing using BlindPairing
- **Built-in Operations** ⚡: Handle invites, writers, and basic operations out of the box
- **Custom Actions** 🎯: Configure custom handlers for your specific use cases
- **Dynamic Action Methods** 🚀: Actions are automatically exposed as TypeScript-safe methods on the instance
- **Default Storage** 💾: All operations are stored in the underlying corestore by default
- **Hyperdrive View** 🗂️: Optional Hyperdrive integration for file-based storage with Hyperbee and Hyperblobs

## Basic Usage

```typescript
import { Easybase } from "easybase";

// Create an Easybase instance
const easybase = new Easybase(corestore, {
  replicate: true,
});

await easybase.ready();

// Create an invite for pairing
const invite = await easybase.createInvite();

// Add/remove writers
await easybase.addWriter(writerKey);
await easybase.removeWriter(writerKey);
```

## Dynamic Action Methods 🚀

Easybase automatically exposes your custom actions as methods on the instance, providing full TypeScript support:

```typescript
import { Easybase } from "easybase";

// Define action types for better type safety
type MyActions = {
  uploadFile: (value: any, context: { view: any; base: any }) => Promise<void>;
  updateMetadata: (
    value: any,
    context: { view: any; base: any }
  ) => Promise<void>;
};

// Create Easybase with typed actions
const easybase = new Easybase<MyActions>(corestore, {
  viewType: "hyperdrive",
  actions: {
    uploadFile: async (value, { view, base }) => {
      const { filename, content } = value;
      await view.put(filename, content);
      console.log(`File ${filename} uploaded successfully`);
    },

    updateMetadata: async (value, { view, base }) => {
      const { key, metadata } = value;
      await view.put(`metadata/${key}`, metadata);
      console.log(`Metadata for ${key} updated`);
    },
  },
});

await easybase.ready();

// Actions are now available as methods with full TypeScript support!
await easybase.uploadFile({
  filename: "example.txt",
  content: "Hello, World!",
});

await easybase.updateMetadata({
  key: "user-profile",
  metadata: { name: "Alice", age: 30 },
});
```

### TypeScript Benefits

- **Autocomplete**: TypeScript will suggest your custom action methods
- **Type Safety**: Full type checking for action parameters and return values
- **IntelliSense**: Hover over methods to see their signatures
- **Compile-time Errors**: Catch typos and type mismatches early

## Hyperdrive View

Easybase supports using Hyperdrive as the underlying view, providing file-based storage with Hyperbee and Hyperblobs:

```typescript
import { Easybase } from "easybase";

// Create Easybase with Hyperdrive view and dynamic actions
const easybase = new Easybase(corestore, {
  viewType: "hyperdrive",
  actions: {
    uploadFile: async (value, { view, base }) => {
      const { filename, content } = value;
      await view.put(filename, content);
      console.log(`File ${filename} uploaded successfully`);
    },

    updateMetadata: async (value, { view, base }) => {
      const { key, metadata } = value;
      await view.put(`metadata/${key}`, metadata);
      console.log(`Metadata for ${key} updated`);
    },
  },
});

await easybase.ready();

// Access Hyperdrive components
const drive = easybase.hyperdriveView;
const db = easybase.hyperbeeDb;
const blobs = easybase.hyperblobs;

if (drive && db && blobs) {
  console.log("Hyperdrive view is ready!");

  // Use dynamic action methods
  await easybase.uploadFile({
    filename: "example.txt",
    content: "Hello, Hyperdrive!",
  });

  // Example: Add a blob
  const blobId = await blobs.put(Buffer.from("This is a blob"));
  await easybase.uploadFile({
    filename: "blob-data.bin",
    content: blobId,
  });
}
```

## 🍐 Using with Pear

Get started quickly with TypeScript support in your Pear project:

### 1. Initialize a new Pear project

```bash
pear init --yes --type terminal
```

### 2. Convert to TypeScript

```bash
mv index.js index.ts
```

### 3. Install dependencies

```bash
bun install
```

### 4. Add type definitions

```bash
bun add github:Drache93/holepunch-types#v0.1.9
```

### 5. Configure TypeScript

Create or update your `tsconfig.json` to include the type definitions:

```json
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@types", "./node_modules/holepunch-types"]
  }
}
```

### 6. You now have full TypeScript support! 🎉

### 7. Example: Build a P2P chat app

Install some of the supported libraries and start building:

```bash
bun add hyperswarm hyperbee
```

```typescript
// index.ts
import Hyperswarm from "hyperswarm";
import Hyperbee from "hyperbee";
import * as b4a from "b4a";

// Full TypeScript support with autocomplete!
const swarm = new Hyperswarm({
  keyPair: crypto.keyPair(), // Properly typed
  maxPeers: 10,
});

const bee = new Hyperbee(core, {
  keyEncoding: "utf-8",
  valueEncoding: "utf-8",
});

swarm.on("connection", (connection, peerInfo) => {
  // Both connection and peerInfo are fully typed
  console.log("Connected to peer:", b4a.toString(peerInfo.publicKey, "hex"));
});

await swarm.join(b4a.from("chat-room", "utf-8"));
```

### 8. Build and run your app

Build your TypeScript project:

```bash
bun build index.ts --outdir . --packages=external
```

Then run it like a normal(TM) Pear app!:

```bash
pear run -d .
```

### 9. Easy development workflow

Update your `package.json` dev script for easy development:

```json
{
  "scripts": {
    "dev": "bun build index.ts --outdir . --packages=external && pear run -d ."
  }
}
```

Then simply run:

```bash
bun run dev
```

## Custom Actions

You can configure custom actions to handle specific operation types. These actions are automatically exposed as methods on the Easybase instance:

```typescript
const easybase = new Easybase(corestore, {
  actions: {
    sendMessage: async (value, { view, base }) => {
      const { message, userId, timestamp } = value;
      await view.append({
        type: "message",
        data: { message, userId, timestamp },
      });
    },
  },
});

// Use the dynamic methods
await easybase.sendMessage({
  message: "Hello!",
  userId: "user123",
  timestamp: Date.now(),
});
```

## Built-in Operations

The following operations are handled automatically:

- `add-invite`: Stores invite data in the view
- `del-invite`: Removes invite data from the view
- `add-writer`: Adds a writer to the autobase
- `remove-writer`: Removes a writer from the autobase

## Pairing

```typescript
// Create an invite
const invite = await easybase.createInvite();

// Share the invite (encoded in z32 format)
console.log("Share this invite:", invite);

// On the other side, use the invite to pair
const pairer = Easybase.pair(corestore, invite);
const pairedEasybase = await pairer.finished();
```

## API Reference 📚

### Constructor Options

```typescript
interface EasybaseOptions<TActions = {}> {
  swarm?: any; // Hyperswarm instance
  bootstrap?: any; // Bootstrap servers
  replicate?: boolean; // Enable replication (default: true)
  key?: any; // Autobase key
  encryptionKey?: any; // Encryption key
  invitePublicKey?: any; // Invite public key
  viewType?: "default" | "hyperdrive"; // View type (default: "default")
  actions?: TActions; // Custom actions (automatically exposed as methods)
}
```

### Methods

- `createInvite()`: Create a new invite for pairing
- `deleteInvite()`: Delete the current invite
- `addWriter(key)`: Add a writer to the autobase
- `removeWriter(key)`: Remove a writer from the autobase
- `ready()`: Wait for the instance to be ready
- `close()`: Close the instance
- **Dynamic Action Methods**: Your custom actions are automatically available as methods

### Properties

- `writerKey`: Get the local writer key
- `key`: Get the autobase key
- `discoveryKey`: Get the discovery key
- `encryptionKey`: Get the encryption key
- `writable`: Check if the autobase is writable
- `base`: Access the underlying Autobase instance
- `hyperdriveView`: Access the Hyperdrive instance (when using `viewType: "hyperdrive"`)
- `hyperbeeDb`: Access the Hyperbee database (when using `viewType: "hyperdrive"`)
- `hyperblobs`: Access the Hyperblobs storage (when using `viewType: "hyperdrive"`)

### TypeScript Types

```typescript
// Action function signature
type ActionFunction<TView> = (
  value: any,
  context: { view: TView; base: Autobase }
) => Promise<void>;

// Helper type for Easybase with typed actions
type EasybaseWithActions<TActions> = Easybase<TActions> & {
  [K in keyof TActions]: (value: any) => Promise<void>;
};
```

---

## 🙏 Thanks

Special thanks to the folks at [Holepunch](https://github.com/holepunchto) for their groundbreaking work on Autobase, Hyperswarm, and the peer-to-peer ecosystem! This package builds on top of their amazing tools.

## 🤝 Contributing

Contributions, suggestions, and feedback are very welcome! Please open an issue or pull request if you spot a problem or want to add more features.

## 📜 License

Apache-2.0 — see LICENSE
