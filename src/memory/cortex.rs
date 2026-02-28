use super::lucid::LucidMemory;
use super::sqlite::SqliteMemory;
use super::traits::{Memory, MemoryCategory, MemoryEntry};
use async_trait::async_trait;
use std::path::Path;

pub struct CortexMemMemory {
    inner: LucidMemory,
}

impl CortexMemMemory {
    const DEFAULT_CORTEX_CMD: &'static str = "cortex-mem";

    pub fn new(workspace_dir: &Path, local: SqliteMemory) -> Self {
        let cortex_cmd = std::env::var("ZEROCLAW_CORTEX_CMD")
            .or_else(|_| std::env::var("ZEROCLAW_LUCID_CMD"))
            .unwrap_or_else(|_| Self::DEFAULT_CORTEX_CMD.to_string());

        let inner = LucidMemory::new_with_command(workspace_dir, local, cortex_cmd);
        Self { inner }
    }
}

#[async_trait]
impl Memory for CortexMemMemory {
    fn name(&self) -> &str {
        "cortex-mem"
    }

    async fn store(
        &self,
        key: &str,
        content: &str,
        category: MemoryCategory,
        session_id: Option<&str>,
    ) -> anyhow::Result<()> {
        self.inner.store(key, content, category, session_id).await
    }

    async fn recall(
        &self,
        query: &str,
        limit: usize,
        session_id: Option<&str>,
    ) -> anyhow::Result<Vec<MemoryEntry>> {
        self.inner.recall(query, limit, session_id).await
    }

    async fn get(&self, key: &str) -> anyhow::Result<Option<MemoryEntry>> {
        self.inner.get(key).await
    }

    async fn list(
        &self,
        category: Option<&MemoryCategory>,
        session_id: Option<&str>,
    ) -> anyhow::Result<Vec<MemoryEntry>> {
        self.inner.list(category, session_id).await
    }

    async fn forget(&self, key: &str) -> anyhow::Result<bool> {
        self.inner.forget(key).await
    }

    async fn count(&self) -> anyhow::Result<usize> {
        self.inner.count().await
    }

    async fn health_check(&self) -> bool {
        self.inner.health_check().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn cortex_backend_reports_expected_name() {
        let tmp = TempDir::new().unwrap();
        let sqlite = SqliteMemory::new(tmp.path()).unwrap();
        let memory = CortexMemMemory::new(tmp.path(), sqlite);
        assert_eq!(memory.name(), "cortex-mem");
    }
}
