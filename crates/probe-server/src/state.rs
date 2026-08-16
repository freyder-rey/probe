use std::{
    collections::HashMap,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use probe_core::{CollectionRepository, HttpExecutor, LoadTestReport, LoadTestRunner};
use tokio::sync::watch;

#[derive(Clone)]
pub struct AppState {
    pub repo: Arc<dyn CollectionRepository>,
    pub engine: Arc<dyn HttpExecutor>,
    pub runner: Arc<dyn LoadTestRunner>,
    pub runs: RunRegistry,
}

/// Registro de ejecuciones de tests en curso/finalizadas.
///
/// Encapsula el mapa compartido; evita exponer el `Mutex<HashMap>` crudo a
/// los handlers.
#[derive(Clone, Default)]
pub struct RunRegistry {
    runs: Arc<Mutex<HashMap<String, RunState>>>,
}

impl RunRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, key: &str) -> Option<RunState> {
        self.runs.lock().ok()?.get(key).cloned()
    }

    pub fn insert(&self, key: String, state: RunState) {
        if let Ok(mut runs) = self.runs.lock() {
            runs.insert(key, state);
        }
    }

    pub fn update<F>(&self, key: &str, f: F)
    where
        F: FnOnce(&mut RunState),
    {
        if let Ok(mut runs) = self.runs.lock() {
            if let Some(run) = runs.get_mut(key) {
                f(run);
            }
        }
    }
}

#[derive(Clone)]
pub struct RunState {
    pub status: String,
    pub done: u64,
    pub total: u64,
    pub cancel: Arc<AtomicBool>,
    pub report: Option<LoadTestReport>,
    pub error: Option<String>,
    /// Notifica cambios de progreso a los suscriptores SSE (último valor).
    pub progress: watch::Sender<RunStatusResponse>,
}

impl RunState {
    pub fn running(cancel: Arc<AtomicBool>) -> Self {
        let (progress, _) = watch::channel(RunStatusResponse {
            status: "running".to_string(),
            done: 0,
            total: 0,
            report: None,
            error: None,
        });
        RunState {
            status: "running".to_string(),
            done: 0,
            total: 0,
            cancel,
            report: None,
            error: None,
            progress,
        }
    }

    /// Emite el estado actual por el canal de progreso (SSE).
    pub fn notify(&self) {
        let _ = self.progress.send(RunStatusResponse::from_run(self));
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStatusResponse {
    pub status: String,
    pub done: u64,
    pub total: u64,
    pub report: Option<LoadTestReport>,
    pub error: Option<String>,
}

impl RunStatusResponse {
    pub fn from_run(run: &RunState) -> Self {
        RunStatusResponse {
            status: run.status.clone(),
            done: run.done,
            total: run.total,
            report: run.report.clone(),
            error: run.error.clone(),
        }
    }
}
