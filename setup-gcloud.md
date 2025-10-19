# Google Cloud Setup Instructions

## 1. Enable Required APIs

Run these commands in Google Cloud Shell or with gcloud CLI:

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com --project=idyllic-bloom-474012-s9

# Enable Cloud Resource Manager API (if needed)
gcloud services enable cloudresourcemanager.googleapis.com --project=idyllic-bloom-474012-s9

# Verify APIs are enabled
gcloud services list --enabled --project=idyllic-bloom-474012-s9 | grep aiplatform
```

## 2. Grant Required Permissions to Service Account

```bash
# Add Vertex AI User role
gcloud projects add-iam-policy-binding idyllic-bloom-474012-s9 \
    --member="serviceAccount:service-account@idyllic-bloom-474012-s9.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# Add ML Developer role (for model access)
gcloud projects add-iam-policy-binding idyllic-bloom-474012-s9 \
    --member="serviceAccount:service-account@idyllic-bloom-474012-s9.iam.gserviceaccount.com" \
    --role="roles/ml.developer"

# Verify permissions
gcloud projects get-iam-policy idyllic-bloom-474012-s9 \
    --flatten="bindings[].members" \
    --format="table(bindings.role)" \
    --filter="bindings.members:service-account@idyllic-bloom-474012-s9.iam.gserviceaccount.com"
```

## 3. Alternative: Use Google Cloud Console

### Enable APIs:
1. Go to: https://console.cloud.google.com/apis/dashboard?project=idyllic-bloom-474012-s9
2. Click "Enable APIs and Services"
3. Search for "Vertex AI API" and enable it
4. Search for "AI Platform API" and enable it

### Grant Permissions:
1. Go to: https://console.cloud.google.com/iam-admin/iam?project=idyllic-bloom-474012-s9
2. Find your service account: `service-account@idyllic-bloom-474012-s9.iam.gserviceaccount.com`
3. Click "Edit principal" (pencil icon)
4. Add these roles:
   - `Vertex AI User` (roles/aiplatform.user)
   - `ML Developer` (roles/ml.developer)
   - `Service Account Token Creator` (roles/iam.serviceAccountTokenCreator)
5. Save changes

## 4. Check Quota and Billing

1. Go to: https://console.cloud.google.com/apis/api/aiplatform.googleapis.com/quotas?project=idyllic-bloom-474012-s9
2. Ensure you have quota for Imagen model requests
3. Verify billing is enabled: https://console.cloud.google.com/billing?project=idyllic-bloom-474012-s9

## 5. Test the Setup

After making these changes, restart your backend server and test again.