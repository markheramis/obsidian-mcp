# Configuration Reference

All configuration options for the Obsidian MCP Server.

## Environment Variables

### Vault Configuration

| Variable           | Type     | Default           | Description                               |
| ------------------ | -------- | ----------------- | ----------------------------------------- |
| `OBSIDIAN_VAULT_PATH` | `string` | Required        | Absolute path to the Obsidian vault       |

### Cache Settings

| Variable                       | Type     | Default | Description                              |
| ------------------------------ | -------- | ------- | ---------------------------------------- |
| `OBSIDIAN_CACHE_TTL`           | `number` | `60000` | File list cache TTL in milliseconds      |
| `OBSIDIAN_CONTENT_CACHE_SIZE`  | `number` | `100`   | Maximum entries in content cache         |
| `OBSIDIAN_SEARCH_CACHE_SIZE`   | `number` | `50`    | Maximum entries in search cache          |
| `OBSIDIAN_SEARCH_CACHE_TTL`    | `number` | `30000` | Search cache TTL in milliseconds         |

### Persistent Cache

| Variable                           | Type      | Default              | Description                       |
| ---------------------------------- | --------- | -------------------- | --------------------------------- |
| `OBSIDIAN_ENABLE_PERSISTENT_CACHE` | `boolean` | `true`               | Enable LMDB-backed persistence    |
| `OBSIDIAN_CACHE_PATH`              | `string`  | `./.obsidian-cache`  | Path to LMDB database directory   |

### Search Optimization

| Variable                            | Type      | Default | Description                          |
| ----------------------------------- | --------- | ------- | ------------------------------------ |
| `OBSIDIAN_ENABLE_INVERTED_INDEX`    | `boolean` | `true`  | Enable inverted index for search     |
| `OBSIDIAN_INDEX_MIN_WORD_LENGTH`    | `number`  | `2`     | Minimum word length to index         |
| `OBSIDIAN_INDEX_MAX_WORDS_PER_FILE` | `number`  | `10000` | Maximum words to index per file      |
| `OBSIDIAN_ENABLE_PATH_TRIE`         | `boolean` | `true`  | Enable path trie for glob matching   |

### Compression

| Variable                          | Type      | Default | Description                             |
| --------------------------------- | --------- | ------- | --------------------------------------- |
| `OBSIDIAN_COMPRESS_LARGE_RESULTS` | `boolean` | `false` | Enable compression for large results    |
| `OBSIDIAN_COMPRESSION_THRESHOLD`  | `number`  | `10240` | Size threshold for compression (bytes)  |

### File Watching

| Variable                         | Type     | Default | Description                        |
| -------------------------------- | -------- | ------- | ---------------------------------- |
| `OBSIDIAN_FILE_WATCHER_DEBOUNCE` | `number` | `100`   | Debounce delay in milliseconds     |

### Cache Warmup

| Variable                       | Type      | Default | Description                       |
| ------------------------------ | --------- | ------- | --------------------------------- |
| `OBSIDIAN_ENABLE_CACHE_WARMUP` | `boolean` | `false` | Enable cache warmup on startup    |
| `OBSIDIAN_WARMUP_FILE_COUNT`   | `number`  | `1000`  | Maximum files to warm on startup  |

## Configuration Examples

### Minimal Configuration

For small vaults with basic requirements:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["path/to/build/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/vault"
      }
    }
  }
}
```

### Performance Configuration

For large vaults requiring optimal performance:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["path/to/build/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/vault",
        "OBSIDIAN_ENABLE_PERSISTENT_CACHE": "true",
        "OBSIDIAN_ENABLE_INVERTED_INDEX": "true",
        "OBSIDIAN_ENABLE_PATH_TRIE": "true",
        "OBSIDIAN_ENABLE_CACHE_WARMUP": "true",
        "OBSIDIAN_CONTENT_CACHE_SIZE": "500",
        "OBSIDIAN_SEARCH_CACHE_SIZE": "100"
      }
    }
  }
}
```

### Memory-Constrained Configuration

For environments with limited memory:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["path/to/build/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/vault",
        "OBSIDIAN_CONTENT_CACHE_SIZE": "50",
        "OBSIDIAN_SEARCH_CACHE_SIZE": "25",
        "OBSIDIAN_COMPRESS_LARGE_RESULTS": "true",
        "OBSIDIAN_ENABLE_INVERTED_INDEX": "false",
        "OBSIDIAN_ENABLE_PATH_TRIE": "false"
      }
    }
  }
}
```

### Fast Startup Configuration

For environments where startup time is critical:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["path/to/build/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/vault",
        "OBSIDIAN_ENABLE_CACHE_WARMUP": "false",
        "OBSIDIAN_ENABLE_INVERTED_INDEX": "false",
        "OBSIDIAN_ENABLE_PATH_TRIE": "false"
      }
    }
  }
}
```

## Configuration by Vault Size

### Small Vault (< 500 files)

Default configuration is sufficient. Consider enabling:
- `OBSIDIAN_ENABLE_CACHE_WARMUP`: `true` for instant performance

### Medium Vault (500 - 5,000 files)

Recommended:
- `OBSIDIAN_ENABLE_INVERTED_INDEX`: `true`
- `OBSIDIAN_ENABLE_PATH_TRIE`: `true`
- `OBSIDIAN_CONTENT_CACHE_SIZE`: `200`

### Large Vault (> 5,000 files)

Recommended:
- All search optimizations enabled
- `OBSIDIAN_ENABLE_PERSISTENT_CACHE`: `true`
- `OBSIDIAN_CONTENT_CACHE_SIZE`: `500`
- `OBSIDIAN_WARMUP_FILE_COUNT`: `2000`
- `OBSIDIAN_COMPRESS_LARGE_RESULTS`: `true`

## Type Coercion

Environment variables are strings. The server converts them:

| Target Type | Conversion                           | Example              |
| ----------- | ------------------------------------ | -------------------- |
| `number`    | `parseInt()` or `parseFloat()`       | `"100"` → `100`      |
| `boolean`   | `=== "true"`                         | `"true"` → `true`    |
| `string`    | Direct use                           | `"/path"` → `"/path"`|

## See Also

- [Features Reference](features/README.md) - What each feature does
- [Tools Reference](tools/README.md) - Available MCP tools
