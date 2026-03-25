/**
 * Mock Firebase Service - In-Memory Firestore Simulation
 * Provides the same API as Firebase Firestore for development
 */

class MockFirestore {
  constructor() {
    this.collections = new Map();
    this.listeners = new Map();
    console.log('🔥 Mock Firebase initialized');
  }

  // Simulate collection reference
  collection(path) {
    if (!this.collections.has(path)) {
      this.collections.set(path, new Map());
    }
    return new MockCollectionRef(path, this);
  }

  // Simulate document reference
  doc(collectionPath, docId) {
    return new MockDocumentRef(collectionPath, docId, this);
  }
}

class MockCollectionRef {
  constructor(path, firestore) {
    this.path = path;
    this.firestore = firestore;
  }

  // Add document
  add(data) {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.doc(id).set(data);
  }

  // Get document reference
  doc(id) {
    return new MockDocumentRef(this.path, id, this.firestore);
  }

  // Get all documents
  async get() {
    const collection = this.firestore.collections.get(this.path) || new Map();
    const docs = [];
    
    for (const [id, data] of collection.entries()) {
      docs.push(new MockDocumentSnapshot(id, data, true));
    }
    
    return new MockQuerySnapshot(docs);
  }

  // Real-time listener
  onSnapshot(callback, errorCallback) {
    const listenerId = `${this.path}_${Date.now()}`;
    
    // Initial callback
    this.get().then(snapshot => {
      callback(snapshot);
    }).catch(error => {
      if (errorCallback) errorCallback(error);
    });

    // Store listener for future updates
    this.firestore.listeners.set(listenerId, {
      path: this.path,
      callback,
      errorCallback
    });

    // Return unsubscribe function
    return () => {
      this.firestore.listeners.delete(listenerId);
    };
  }

  // Query methods
  where(field, operator, value) {
    return new MockQuery(this.path, this.firestore, [{ field, operator, value }]);
  }

  orderBy(field, direction = 'asc') {
    return new MockQuery(this.path, this.firestore, [], [{ field, direction }]);
  }
}

class MockQuery {
  constructor(path, firestore, whereConditions = [], orderConditions = []) {
    this.path = path;
    this.firestore = firestore;
    this.whereConditions = whereConditions;
    this.orderConditions = orderConditions;
  }

  where(field, operator, value) {
    return new MockQuery(
      this.path, 
      this.firestore, 
      [...this.whereConditions, { field, operator, value }],
      this.orderConditions
    );
  }

  orderBy(field, direction = 'asc') {
    return new MockQuery(
      this.path, 
      this.firestore, 
      this.whereConditions,
      [...this.orderConditions, { field, direction }]
    );
  }

  async get() {
    const collection = this.firestore.collections.get(this.path) || new Map();
    let docs = [];
    
    // Convert to array and apply filters
    for (const [id, data] of collection.entries()) {
      let include = true;
      
      // Apply where conditions
      for (const condition of this.whereConditions) {
        const fieldValue = data[condition.field];
        switch (condition.operator) {
          case '==':
            if (fieldValue !== condition.value) include = false;
            break;
          case '!=':
            if (fieldValue === condition.value) include = false;
            break;
          case '>':
            if (fieldValue <= condition.value) include = false;
            break;
          case '>=':
            if (fieldValue < condition.value) include = false;
            break;
          case '<':
            if (fieldValue >= condition.value) include = false;
            break;
          case '<=':
            if (fieldValue > condition.value) include = false;
            break;
          case 'in':
            if (!condition.value.includes(fieldValue)) include = false;
            break;
          case 'array-contains':
            if (!Array.isArray(fieldValue) || !fieldValue.includes(condition.value)) include = false;
            break;
        }
        if (!include) break;
      }
      
      if (include) {
        docs.push(new MockDocumentSnapshot(id, data, true));
      }
    }
    
    // Apply ordering
    for (const order of this.orderConditions) {
      docs.sort((a, b) => {
        const aVal = a.data()[order.field] || '';
        const bVal = b.data()[order.field] || '';
        
        if (order.direction === 'desc') {
          return bVal.toString().localeCompare(aVal.toString());
        } else {
          return aVal.toString().localeCompare(bVal.toString());
        }
      });
    }
    
    return new MockQuerySnapshot(docs);
  }

  onSnapshot(callback, errorCallback) {
    const listenerId = `${this.path}_query_${Date.now()}`;
    
    // Initial callback
    this.get().then(snapshot => {
      callback(snapshot);
    }).catch(error => {
      if (errorCallback) errorCallback(error);
    });

    // Store listener for future updates
    this.firestore.listeners.set(listenerId, {
      path: this.path,
      callback,
      errorCallback,
      isQuery: true,
      whereConditions: this.whereConditions,
      orderConditions: this.orderConditions
    });

    // Return unsubscribe function
    return () => {
      this.firestore.listeners.delete(listenerId);
    };
  }
}

class MockDocumentRef {
  constructor(collectionPath, id, firestore) {
    this.collectionPath = collectionPath;
    this.id = id;
    this.firestore = firestore;
  }

  // Set document data
  async set(data) {
    const collection = this.firestore.collections.get(this.collectionPath) || new Map();
    collection.set(this.id, { ...data, id: this.id });
    this.firestore.collections.set(this.collectionPath, collection);
    
    // Notify listeners
    this._notifyListeners();
    
    return Promise.resolve();
  }

  // Update document data
  async update(data) {
    const collection = this.firestore.collections.get(this.collectionPath) || new Map();
    const existing = collection.get(this.id) || {};
    collection.set(this.id, { ...existing, ...data, id: this.id });
    this.firestore.collections.set(this.collectionPath, collection);
    
    // Notify listeners
    this._notifyListeners();
    
    return Promise.resolve();
  }

  // Delete document
  async delete() {
    const collection = this.firestore.collections.get(this.collectionPath);
    if (collection) {
      collection.delete(this.id);
      this._notifyListeners();
    }
    return Promise.resolve();
  }

  // Get document
  async get() {
    const collection = this.firestore.collections.get(this.collectionPath) || new Map();
    const data = collection.get(this.id);
    return new MockDocumentSnapshot(this.id, data, !!data);
  }

  // Notify all listeners about changes
  _notifyListeners() {
    setTimeout(() => {
      for (const [listenerId, listener] of this.firestore.listeners.entries()) {
        if (listener.path === this.collectionPath) {
          try {
            if (listener.isQuery) {
              // Handle query listeners
              const query = new MockQuery(
                listener.path, 
                this.firestore, 
                listener.whereConditions, 
                listener.orderConditions
              );
              query.get().then(snapshot => {
                listener.callback(snapshot);
              });
            } else {
              // Handle collection listeners
              const collectionRef = new MockCollectionRef(listener.path, this.firestore);
              collectionRef.get().then(snapshot => {
                listener.callback(snapshot);
              });
            }
          } catch (error) {
            if (listener.errorCallback) {
              listener.errorCallback(error);
            }
          }
        }
      }
    }, 10); // Small delay to simulate async behavior
  }
}

class MockDocumentSnapshot {
  constructor(id, data, exists) {
    this.id = id;
    this._data = data;
    this.exists = exists;
  }

  data() {
    return this._data;
  }
}

class MockQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }

  forEach(callback) {
    this.docs.forEach(callback);
  }
}

class MockWriteBatch {
  constructor(firestore) {
    this.firestore = firestore;
    this.operations = [];
  }

  set(docRef, data) {
    this.operations.push({
      type: 'set',
      docRef,
      data
    });
    return this;
  }

  update(docRef, data) {
    this.operations.push({
      type: 'update',
      docRef,
      data
    });
    return this;
  }

  delete(docRef) {
    this.operations.push({
      type: 'delete',
      docRef
    });
    return this;
  }

  async commit() {
    for (const operation of this.operations) {
      switch (operation.type) {
        case 'set':
          await operation.docRef.set(operation.data);
          break;
        case 'update':
          await operation.docRef.update(operation.data);
          break;
        case 'delete':
          await operation.docRef.delete();
          break;
      }
    }
    this.operations = [];
    return Promise.resolve();
  }
}

// Create global mock firestore instance
const mockFirestore = new MockFirestore();

// Mock Firebase functions
export const collection = (db, path) => {
  return mockFirestore.collection(path);
};

export const doc = (db, collectionPath, docId) => {
  if (docId) {
    return mockFirestore.doc(collectionPath, docId);
  } else {
    // Handle doc(collection, id) format
    return mockFirestore.doc(db, collectionPath);
  }
};

export const setDoc = async (docRef, data) => {
  return docRef.set(data);
};

export const updateDoc = async (docRef, data) => {
  return docRef.update(data);
};

export const deleteDoc = async (docRef) => {
  return docRef.delete();
};

export const getDoc = async (docRef) => {
  return docRef.get();
};

export const getDocs = async (collectionRef) => {
  return collectionRef.get();
};

export const onSnapshot = (ref, callback, errorCallback) => {
  return ref.onSnapshot(callback, errorCallback);
};

export const query = (collectionRef, ...constraints) => {
  let result = collectionRef;
  
  for (const constraint of constraints) {
    if (constraint.type === 'where') {
      result = result.where(constraint.field, constraint.operator, constraint.value);
    } else if (constraint.type === 'orderBy') {
      result = result.orderBy(constraint.field, constraint.direction);
    }
  }
  
  return result;
};

export const where = (field, operator, value) => {
  return { type: 'where', field, operator, value };
};

export const orderBy = (field, direction = 'asc') => {
  return { type: 'orderBy', field, direction };
};

export const writeBatch = (db) => {
  return new MockWriteBatch(mockFirestore);
};

// Export mock database
export const db = mockFirestore;

console.log('📦 Mock Firebase service loaded successfully');