# Storage

Glasshouse stores a session as one immutable JSON document. In production, write each event append-only to object storage or a database; never update a persisted event in place.

The web demo creates its deterministic session in memory so the tampering moment is safe and repeatable.
