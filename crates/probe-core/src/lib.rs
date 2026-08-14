//! probe-core: núcleo compartido de probe.
//!
//! Organizado en capas:
//! - `domain`: modelos puros del dominio (Request, Collection, Response, Validation).
//! - `application`: servicios (motor HTTP, runner de validaciones, futuro runner de carga).
//! - `infrastructure`: persistencia y acceso a IO.

pub mod application;
pub mod domain;
pub mod infrastructure;

pub use application::Engine;
pub use domain::{Body, Collection, KeyValue, Request, Response, Validation, ValidationResult};
pub use infrastructure::Storage;
