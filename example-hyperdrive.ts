import { Easybase } from "./index.ts";
import Corestore from "corestore";

async function example() {
  // Create a corestore
  const store = new Corestore("./data");

  // Create Easybase with Hyperdrive view
  const easybase = new Easybase(store, {
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

    // Example: Update metadata
    await easybase.base.append({
      type: "update-metadata",
      key: "user-profile",
      metadata: { name: "Alice", age: 30 },
    });

    // Example: Add a blob
    const blobId = await blobs.put(Buffer.from("This is a blob"));
    await easybase.base.append({
      type: "upload-file",
      filename: "blob-data.bin",
      content: blobId,
    });
  }

  // Create an invite for pairing
  const invite = await easybase.createInvite();
  console.log("Invite:", invite);

  // Clean up
  await easybase.close();
  await store.close();
}

// Run the example
example().catch(console.error);
