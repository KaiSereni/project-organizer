# Welcome to Cloud Functions for Firebase for Python!
# To get started, simply uncomment the below code or create your own.
# Deploy with `firebase deploy`

from firebase_functions import https_fn
from firebase_functions.options import CorsOptions, set_global_options
from firebase_admin import initialize_app, auth
from firebase_admin import firestore as admin_firestore
from typing import Any, Dict

set_global_options(max_instances=10)
app = initialize_app()


@https_fn.on_call(cors=CorsOptions(cors_origins=["*"], cors_methods=["POST"]), enforce_app_check=False)
def save_user_profile(req: https_fn.CallableRequest) -> Dict[str, Any]:

    if req.auth is None or req.auth.uid is None:
        raise https_fn.HttpsError("unauthenticated", "User must be signed in.")

    uid = req.auth.uid
    user: auth.UserRecord = auth.get_user(uid)
    username = user.display_name

    data = req.data
    if not isinstance(data, dict):
        raise https_fn.HttpsError("invalid-argument", "Payload must be an object.")

    db = admin_firestore.client()
    doc_ref = db.collection("users").document(uid)

    profile: Dict[str, Any] = {"username": username, "userdata": data}
    doc_ref.set(profile, merge=True)

    return {"ok": True}