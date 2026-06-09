
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

// verify token


async function run() {
  // await client.connect();

  const db = client.db("petAdoptionDB");
  const usersCollection = db.collection("users");

  // CRITICAL FIX: Standardizing on the "add-pets" collection name across ALL endpoints
  const petCollection = db.collection("add-pets");
  const adoptRequestsCollection = db.collection("adopt-requests");

  // 1. GET: Fetch all pets for your dashboard view/edit list
  

  // 2. POST: Create a new pet listing (FIXED SUBMIT ERROR)
  
  // get Add this route to your server.js
 

  // 3. DELETE: Remove a pet listing by ID (FIXED)
  

  // 4. PUT: Complete update mechanism for editing pet details (FIXED)
  

  // 5. POST: Submit an adoption request with full security guards
  

  // 6. GET Route: Directory Fetch with Live Filter Metrics
  

  // 7. GET: Fetch all adoption requests
  

  app.patch("/adopt-requests/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const reqDoc = await adoptRequestsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!reqDoc) {
        return res.status(404).json({ error: "Request not found" });
      }

      // 1. update request status
      await adoptRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } },
      );

      // 2. if approved → mark pet as adopted
      if (status === "approved") {
        await petCollection.updateOne(
          { _id: new ObjectId(reqDoc.petId) },
          {
            $set: {
              status: "adopted",
              adopted: true,
            },
          },
        );
      }

      res.json({ success: true, message: "Status updated" });
    } catch (err) {
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // 9. DELETE: Remove an adoption application row
  app.delete("/adopt-requests/:id", verifyToken, async (req, res) => {
    try {
      const targetId = req.params.id;

      let queryObj = {};
      try {
        queryObj = { _id: new ObjectId(targetId) };
      } catch {
        queryObj = { _id: targetId };
      }

      const outputResult = await adoptRequestsCollection.deleteOne(queryObj);

      if (outputResult.deletedCount === 1) {
        res.json({ success: true, message: "Application data row cleared." });
      } else {
        res.status(404).json({ error: "No matching document logs found." });
      }
    } catch (err) {
      res.status(500).json({ error: "Internal processing error." });
    }
  });

  // await client.db("admin").command({ ping: 1 });
  console.log("Connected to MongoDB successfully!");
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Pet Adoption Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});