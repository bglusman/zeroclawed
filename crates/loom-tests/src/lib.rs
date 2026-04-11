//! Loom concurrency tests for ZeroClawed
//!
//! This crate uses Loom to exhaustively explore all possible thread
//! interleavings to detect data races, deadlocks, and memory ordering bugs.
//!
//! # Running Loom Tests
//!
//! Standard run (faster, explores fewer interleavings):
//! ```bash
//! RUSTFLAGS="--cfg loom" cargo test -p loom-tests
//! ```
//!
//! Exhaustive run (slower, more thorough):
//! ```bash
//! LOOM_MAX_PREEMPTIONS=3 RUSTFLAGS="--cfg loom" cargo test -p loom-tests
//! ```

#![cfg(loom)]

use loom::sync::{Arc, Mutex, RwLock};
use loom::thread;
use std::collections::HashMap;

/// Test concurrent access to a shared registry pattern
#[test]
fn test_concurrent_registry_access() {
    loom::model(|| {
        let registry: Arc<Mutex<HashMap<String, String>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let registry2 = Arc::clone(&registry);
        let registry_final = Arc::clone(&registry);

        // Thread 1: Insert entries
        let t1 = thread::spawn(move || {
            let mut guard = registry.lock().unwrap();
            guard.insert("agent1".to_string(), "config1".to_string());
            guard.insert("agent2".to_string(), "config2".to_string());
        });

        // Thread 2: Read entries
        let t2 = thread::spawn(move || {
            let guard = registry2.lock().unwrap();
            let _count = guard.len();
        });

        t1.join().unwrap();
        t2.join().unwrap();

        let guard = registry_final.lock().unwrap();
        assert_eq!(guard.len(), 2);
        assert_eq!(guard.get("agent1"), Some(&"config1".to_string()));
        assert_eq!(guard.get("agent2"), Some(&"config2".to_string()));
    });
}

/// Test session management pattern with concurrent reads and writes
#[test]
fn test_concurrent_session_management() {
    loom::model(|| {
        let sessions: Arc<RwLock<HashMap<String, String>>> =
            Arc::new(RwLock::new(HashMap::new()));
        let sessions2 = Arc::clone(&sessions);
        let sessions3 = Arc::clone(&sessions);
        let sessions_final = Arc::clone(&sessions);

        let t1 = thread::spawn(move || {
            let mut guard = sessions.write().unwrap();
            guard.insert("session_1".to_string(), "user_a".to_string());
            guard.insert("session_2".to_string(), "user_b".to_string());
        });

        let t2 = thread::spawn(move || {
            let guard = sessions2.read().unwrap();
            let _count = guard.len();
            let _ = guard.get("session_1");
        });

        let t3 = thread::spawn(move || {
            let mut guard = sessions3.write().unwrap();
            guard.insert("session_3".to_string(), "user_c".to_string());
        });

        t1.join().unwrap();
        t2.join().unwrap();
        t3.join().unwrap();

        let guard = sessions_final.read().unwrap();
        assert!(guard.len() >= 2);
    });
}

/// Test reference counting lifecycle
#[test]
fn test_arc_lifecycle() {
    loom::model(|| {
        let data = Arc::new(Mutex::new(0));
        let data2 = Arc::clone(&data);
        let data3 = Arc::clone(&data);

        let t1 = thread::spawn(move || {
            let mut guard = data2.lock().unwrap();
            *guard += 1;
        });

        let t2 = thread::spawn(move || {
            let mut guard = data3.lock().unwrap();
            *guard += 1;
        });

        t1.join().unwrap();
        t2.join().unwrap();

        let guard = data.lock().unwrap();
        assert_eq!(*guard, 2);
    });
}

/// Test channel-like message passing pattern
#[test]
fn test_message_passing() {
    loom::model(|| {
        use loom::sync::mpsc;

        let (tx, rx) = mpsc::channel();
        let tx2 = tx.clone();

        let t1 = thread::spawn(move || {
            tx.send("message1").unwrap();
        });

        let t2 = thread::spawn(move || {
            tx2.send("message2").unwrap();
        });

        let t3 = thread::spawn(move || {
            let mut count = 0;
            while let Ok(_msg) = rx.recv() {
                count += 1;
                if count >= 2 {
                    break;
                }
            }
            assert_eq!(count, 2);
        });

        t1.join().unwrap();
        t2.join().unwrap();
        t3.join().unwrap();
    });
}

/// Test concurrent configuration access (simulates zeroclawed config access pattern)
#[test]
fn test_concurrent_config_access() {
    loom::model(|| {
        let config: Arc<RwLock<HashMap<String, bool>>> =
            Arc::new(RwLock::new(HashMap::new()));

        // Initialize config
        {
            let mut guard = config.write().unwrap();
            guard.insert("feature_a".to_string(), true);
            guard.insert("feature_b".to_string(), false);
        }

        let config2 = Arc::clone(&config);
        let config3 = Arc::clone(&config);

        // Concurrent readers
        let t1 = thread::spawn(move || {
            let guard = config2.read().unwrap();
            let _ = guard.get("feature_a");
        });

        // Concurrent writer
        let t2 = thread::spawn(move || {
            let mut guard = config3.write().unwrap();
            guard.insert("feature_c".to_string(), true);
        });

        t1.join().unwrap();
        t2.join().unwrap();

        let guard = config.read().unwrap();
        assert!(guard.contains_key("feature_c"));
    });
}
