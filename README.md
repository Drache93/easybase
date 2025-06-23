# autostate

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.16. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

# Easybase

A simple wrapper around Autobase that makes pairing and sharing easy, with configurable actions for handling custom operations.

## Features

- **Simple Pairing**: Easy invite-based pairing using BlindPairing
- **Built-in Operations**: Handle invites, writers, and basic operations out of the box
- **Custom Actions**: Configure custom handlers for your specific use cases
- **Default Storage**: All operations are stored in the underlying corestore by default

## Installation

```bash
bun install
```

## Basic Usage

```typescript
import { Easybase } from "./easybase";

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

## API Reference

### Constructor Options

```typescript
interface EasybaseOptions {
  swarm?: any; // Hyperswarm instance
  bootstrap?: any; // Bootstrap servers
  replicate?: boolean; // Enable replication (default: true)
  key?: any; // Autobase key
  encryptionKey?: any; // Encryption key
  invitePublicKey?: any; // Invite public key
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
