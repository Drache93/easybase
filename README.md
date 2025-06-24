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

## Hyperdrive View

Easybase supports using Hyperdrive as the underlying view, providing file-based storage with Hyperbee and Hyperblobs:

```typescript
import { Easybase } from "easybase";

// Create Easybase with Hyperdrive view
const easybase = new Easybase(corestore, {
  viewType: "hyperdrive",
  actions: {
    // Custom action for handling file uploads
    "upload-file": async (value, { view, base }) => {
      const { filename, content } = value;
      await view.put(filename, content);
      console.log(`File ${filename} uploaded successfully`);
    },

    // Custom action for handling metadata
    "update-metadata": async (value, { view, base }) => {
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

  // Example: Upload a file
  await easybase.base.append({
    type: "upload-file",
    filename: "example.txt",
    content: "Hello, Hyperdrive!",
  });

  // Example: Add a blob
  const blobId = await blobs.put(Buffer.from("This is a blob"));
  await easybase.base.append({
    type: "upload-file",
    filename: "blob-data.bin",
    content: blobId,
  });
}
```

### Hyperdrive Helper Methods

When using `viewType: "hyperdrive"`, you can access the underlying components:

- `hyperdriveView`: Access the Hyperdrive instance
- `hyperbeeDb`: Access the Hyperbee database
- `hyperblobs`: Access the Hyperblobs storage

### Built-in Hyperdrive Operations

When using the Hyperdrive view, the following operations are handled automatically:

- `addWriter`: Adds a writer to the autobase (handles hex key conversion)
- Blob operations: Automatically handles file existence checks and blob storage

## Custom Actions

You can configure custom actions to handle specific operation types:

```typescript
const customActions = {
  "user-message": async (value, context) => {
    const { message, userId, timestamp } = value;
    await context.view.append({
      type: "message",
      data: { message, userId, timestamp },
    });
  },

  "file-upload": async (value, context) => {
    const { fileName, fileHash, userId } = value;
    await context.view.append({
      type: "file",
      data: { fileName, fileHash, userId },
    });
  },
};

const easybase = new Easybase(corestore, {
  actions: customActions,
});

// Use custom operations
await easybase.base.append({
  type: "user-message",
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
interface EasybaseOptions {
  swarm?: any; // Hyperswarm instance
  bootstrap?: any; // Bootstrap servers
  replicate?: boolean; // Enable replication (default: true)
  key?: any; // Autobase key
  encryptionKey?: any; // Encryption key
  invitePublicKey?: any; // Invite public key
  viewType?: "default" | "hyperdrive"; // View type (default: "default")
  actions?: Record<
    string,
    (value: any, context: { view: any; base: any }) => Promise<void>
  >;
}
```

### Methods

- `createInvite()`: Create a new invite for pairing
- `deleteInvite()`: Delete the current invite
- `addWriter(key)`: Add a writer to the autobase
- `removeWriter(key)`: Remove a writer from the autobase
- `ready()`: Wait for the instance to be ready
- `close()`: Close the instance

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

---

## 🙏 Thanks

Special thanks to the folks at [Holepunch](https://github.com/holepunchto) for their groundbreaking work on Autobase, Hyperswarm, and the peer-to-peer ecosystem! This package builds on top of their amazing tools.

## 🤝 Contributing

Contributions, suggestions, and feedback are very welcome! Please open an issue or pull request if you spot a problem or want to add more features.

## 📜 License

Apache-2.0 — see LICENSE
