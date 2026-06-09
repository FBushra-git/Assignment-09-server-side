
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
const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Foridden" });
  }
};

async function run() {
  // await client.connect();

  const db = client.db("petAdoptionDB");
  const usersCollection = db.collection("users");

  // CRITICAL FIX: Standardizing on the "add-pets" collection name across ALL endpoints
  const petCollection = db.collection("add-pets");
  const adoptRequestsCollection = db.collection("adopt-requests");

  // 1. GET: Fetch all pets for your dashboard view/edit list
  app.get("/add-pet", verifyToken, async (req, res) => {
    try {
      const result = await petCollection.find().toArray();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pets" });
    }
  });

  // 2. POST: Create a new pet listing (FIXED SUBMIT ERROR)
  app.post("/add-pet", verifyToken, async (req, res) => {
    try {
      const petData = req.body;

      petData.ownerEmail = petData.ownerEmail || "user@example.com";

      petData.status = "available";
      petData.adopted = false;
      petData.createdAt = new Date();

      const result = await petCollection.insertOne(petData);

      res.status(201).json({
        success: true,
        insertedId: result.insertedId,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to add pet" });
    }
  });
  // get Add this route to your server.js
   app.get("/add-pet/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      let query = {};
      try {
        query = { _id: new ObjectId(id) };
      } catch {
        query = { _id: id };
      }

      const pet = await petCollection.findOne(query);
      if (!pet) return res.status(404).json({ error: "Pet not found" });
      res.json(pet);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // 3. DELETE: Remove a pet listing by ID (FIXED)
  app.delete("/add-pet/:id", verifyToken, async (req, res) => {
    try {
      const petId = req.params.id;
      let query = {};
      try {
        query = { _id: new ObjectId(petId) };
      } catch {
        query = { _id: petId };
      }

      const result = await petCollection.deleteOne(query);
      if (result.deletedCount === 1) {
        res.json({ success: true, message: "Pet deleted successfully" });
      } else {
        res.status(404).json({ error: "Pet profile not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Internal server error during deletion" });
    }
  });

  // 4. PUT: Complete update mechanism for editing pet details (FIXED)
  app.put("/add-pet/:id", verifyToken, async (req, res) => {
    try {
      const petId = req.params.id;
      const targetUpdates = req.body;
      let queryObj = {};
      try {
        queryObj = { _id: new ObjectId(petId) };
      } catch {
        queryObj = { _id: petId };
      }

      // Delete _id from payload if it accidentally passed through to prevent immutable field errors
      delete targetUpdates._id;

      const runModifyPipeline = await petCollection.updateOne(queryObj, {
        $set: targetUpdates,
      });

      if (runModifyPipeline.matchedCount === 1) {
        res.json({ success: true, message: "Asset layout changes updated." });
      } else {
        res.status(404).json({ error: "Document reference mismatch." });
      }
    } catch (err) {
      res.status(500).json({ error: "Server updating transaction failure." });
    }
  });

  // 5. POST: Submit an adoption request with full security guards
  app.post("/adopt-requests", verifyToken, async (req, res) => {
    try {
      const {
        petId,
        petitionerEmail,
        ownerEmail,
        petName,
        imageUrl,
        pickupDate,
        requestDate,
        message,
        userName,
      } = req.body;

      let petQuery = {};
      try {
        petQuery = { _id: new ObjectId(petId) };
      } catch {
        petQuery = { _id: petId };
      }

      const targetedPetProfile = await petCollection.findOne(petQuery);

      if (
        petitionerEmail?.trim().toLowerCase() ===
        targetedPetProfile.ownerEmail?.trim().toLowerCase()
      ) {
        return res.status(403).json({
          success: false,
          error: "You cannot adopt your own pet!",
        });
      }
      if (!targetedPetProfile) {
        return res.status(404).json({
          success: false,
          error: "Target pet record profile not found.",
        });
      }

      if (
        targetedPetProfile.status === "adopted" ||
        targetedPetProfile.adopted === true
      ) {
        return res.status(400).json({
          success: false,
          error: "This pet has already been adopted!",
        });
      }

      const duplicateApplication = await adoptRequestsCollection.findOne({
        petId,
        petitionerEmail,
      });

      if (duplicateApplication) {
        return res.status(400).json({
          success: false,
          error: "You already have a pending application file for this pet!",
        });
      }

      const result = await adoptRequestsCollection.insertOne({
        petId,
        petName,
        imageUrl,
        ownerEmail: ownerEmail || "seller@example.com",
        petitionerEmail,
        pickupDate,
        requestDate,
        message,
        userName,
        status: "pending",
        createdAt: new Date(),
      });
      await petCollection.updateOne(
        { _id: new ObjectId(petId) },
        {
          $set: {
            status: "pending",
          },
        },
      );

      res.status(201).json({
        success: true,
        message: "Request saved successfully!",
        result,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Failed to log adoption submission to DB",
      });
    }
  });

  // 6. GET Route: Directory Fetch with Live Filter Metrics
  app.get("/all-pets", async (req, res) => {
    try {
      const { search, species, sort, page = 1, limit = 9 } = req.query;

      let databaseQueryFilter = {};

      if (search) {
        databaseQueryFilter.petName = { $regex: search, $options: "i" };
      }

      if (species) {
        databaseQueryFilter.species = { $in: species.split(",") };
      }

      let databaseSortRule = {};
      if (sort === "fee-low") databaseSortRule.adoptionFee = 1;
      else if (sort === "fee-high") databaseSortRule.adoptionFee = -1;
      else databaseSortRule.createdAt = -1;

      const skip = (Number(page) - 1) * Number(limit);

      const pets = await petCollection
        .find(databaseQueryFilter)
        .sort(databaseSortRule)
        .skip(skip)
        .limit(Number(limit))
        .toArray();

      const total = await petCollection.countDocuments(databaseQueryFilter);

      res.json({
        pets,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
      });
    } catch (err) {
      res.status(500).json({ error: "Pagination failed" });
    }
  });

  // 7. GET: Fetch all adoption requests
  app.get("/adopt-requests", verifyToken, async (req, res) => {
    try {
      const result = await adoptRequestsCollection.find().toArray();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch adoption records" });
    }
  });

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