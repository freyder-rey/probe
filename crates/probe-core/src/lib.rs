//! probe-core: núcleo compartido de probe.
//!
//! Organizado en capas:
//! - `domain`: modelos puros del dominio (Request, Collection, Response, Validation).
//! - `application`: servicios (motor HTTP, runner de validaciones, futuro runner de carga).
//! - `infrastructure`: persistencia y acceso a IO.

pub mod application;
pub mod domain;
pub mod infrastructure;

pub use application::{
    interpolate, CollectionRepository, CsvRowLoader, Engine, HttpExecutor, LoadTestRunner, Runner,
};
pub use domain::{
    Body, Collection, CollectionSummary, CsvSource, KeyValue, LoadTest, LoadTestReport, Request,
    RequestSummary, Response, Validation, ValidationResult,
};
pub use infrastructure::{
    csv_dir, load_csv_rows, CsvLoader, FileCollectionRepository, InMemoryCollectionRepository,
};
