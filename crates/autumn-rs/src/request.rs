use serde::Serialize;

pub(crate) fn query_string<T: Serialize>(params: &T) -> crate::Result<String> {
    let value = serde_json::to_value(params)?;
    let Some(object) = value.as_object() else {
        return Ok(String::new());
    };

    let mut parts = Vec::new();
    for (key, value) in object {
        if value.is_null() {
            continue;
        }

        match value {
            serde_json::Value::Array(values) => {
                let joined = values
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .collect::<Vec<_>>()
                    .join(",");
                if !joined.is_empty() {
                    parts.push(format!("{key}={joined}"));
                }
            }
            serde_json::Value::String(text) => parts.push(format!("{key}={text}")),
            serde_json::Value::Bool(flag) => parts.push(format!("{key}={flag}")),
            serde_json::Value::Number(number) => parts.push(format!("{key}={number}")),
            _ => {}
        }
    }

    Ok(parts.join("&"))
}
