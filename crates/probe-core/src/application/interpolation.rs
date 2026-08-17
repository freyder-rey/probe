use std::collections::HashMap;

/// Reemplaza los placeholders `{{nombre}}` y `:nombre` con el valor de la variable.
/// Las variables desconocidas se dejan intactas para que el usuario las vea.
pub fn interpolate(template: &str, vars: &HashMap<String, String>) -> String {
    if vars.is_empty() {
        return template.to_string();
    }
    let mut out = template.to_string();
    for (key, value) in vars {
        out = out.replace(&format!("{{{{{key}}}}}"), value);
        out = out.replace(&format!(":{key}"), value);
    }
    out
}
