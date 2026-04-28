use autumn_rs::{Autumn, Result};

#[tokio::main]
async fn main() -> Result<()> {
    let token = std::env::var("AUTUMN_SECRET_KEY")
        .map_err(|_| autumn_rs::AutumnError::MissingRequiredField("AUTUMN_SECRET_KEY"))?;
    let autumn = Autumn::new(token)?;

    let result = autumn
        .attach("customer_123")
        .plan("pro")
        .success_url("https://example.com/success")
        .send()
        .await?;

    if let Some(url) = result.payment_url {
        println!("Redirect customer to {url}");
    } else {
        println!("Plan attached without checkout for {}", result.customer_id);
    }
    Ok(())
}
