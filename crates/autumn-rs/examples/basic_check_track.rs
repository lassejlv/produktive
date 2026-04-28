use autumn_rs::{Autumn, Result};

#[tokio::main]
async fn main() -> Result<()> {
    let token = std::env::var("AUTUMN_SECRET_KEY")
        .map_err(|_| autumn_rs::AutumnError::MissingRequiredField("AUTUMN_SECRET_KEY"))?;
    let autumn = Autumn::new(token)?;

    let res = autumn
        .check("customer_123")
        .feature("messages")
        .required_balance(1.0)
        .send()
        .await?;

    if res.allowed {
        autumn
            .track("customer_123")
            .feature("messages")
            .value(1.0)
            .send()
            .await?;
    }

    Ok(())
}
