import os
import time
from playwright.sync_api import sync_playwright

ARTIFACTS_DIR = r"C:\Users\aswit\.gemini\antigravity\brain\934a3db1-b5b4-4adb-bc09-4c61e5c95301"
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

console_errors = []

def run_ui_suite():
    print("Launching Chrome via Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        
        # 1. Desktop Context
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: console_errors.append(str(exc)))

        # Navigate to frontend
        print("Navigating to http://localhost:5173/login...")
        page.goto("http://localhost:5173/login", wait_until="networkidle")
        time.sleep(1)
        
        # Screenshot Login
        login_shot = os.path.join(ARTIFACTS_DIR, "ui_1_login.png")
        page.screenshot(path=login_shot)
        print(f"Captured: {login_shot}")

        # Register/Login fresh test user
        ts = int(time.time())
        email = f"ui_test_{ts}@example.com"
        pwd = "Password123!"
        
        # Switch to Register tab if available, or register via API and login via UI
        import httpx
        httpx.post("http://127.0.0.1:8000/auth/register", json={
            "email": email, "password": pwd, "full_name": "UI Persona User"
        }, timeout=15)
        
        # Fill Login form
        page.fill("input[type='email'], input[name='email']", email)
        page.fill("input[type='password'], input[name='password']", pwd)
        page.click("button[type='submit']")
        page.wait_for_url("**/dashboard", timeout=15000)
        time.sleep(2)

        # 2. Complete Assessment for High-Risk Older User with Angina / Hypertension
        print("Navigating to Take Assessment...")
        page.goto("http://localhost:5173/assessment", wait_until="networkidle")
        time.sleep(1)
        
        # Submit assessment via API for this user so all dashboard state is populated
        # Or fetch token from localStorage
        token = page.evaluate("() => localStorage.getItem('token') || localStorage.getItem('access_token')")
        print(f"Retrieved token from localStorage: {bool(token)}")
        
        if token:
            # Create Assessment 1 (High risk with angina, high BP, skipped vitals test)
            h_payload = {
                "age": 65, "Age": 65, "sex": 1, "Sex": 1, "cp": 0, "trestbps": 160, "chol": 280, "fbs": 1, "exang": 1,
                "BMI": 35, "HighBP": 1, "HighChol": 1, "Smoker": 1, "PhysActivity": 0,
                "Fruits": 0, "Veggies": 0, "HvyAlcoholConsump": 0, "Stroke": 1,
                "HeartDiseaseorAttack": 1, "DiffWalk": 1, "GenHlth": 5, "MentHlth": 10, "PhysHlth": 20
            }
            httpx.post("http://127.0.0.1:8000/predict", headers={"Authorization": f"Bearer {token}"}, json=h_payload, timeout=15)
            
            # Reload dashboard
            page.goto("http://localhost:5173/dashboard", wait_until="networkidle")
            time.sleep(3)

        # 3. Capture Dashboard: Shows both diseases, risk gauges, health score
        dash_shot = os.path.join(ARTIFACTS_DIR, "ui_2_dashboard_overview.png")
        page.screenshot(path=dash_shot)
        print(f"Captured: {dash_shot}")

        # 4. Capture "Why Your Results Look This Way" (SHAP Explanations)
        # Click on SHAP tab
        shap_tab = page.locator("button:has-text('Why Your Results Look This Way'), button:has-text('Why'), [data-tab='shap']").first
        if shap_tab.count() > 0:
            shap_tab.click()
            time.sleep(1.5)
            shap_shot = os.path.join(ARTIFACTS_DIR, "ui_3_shap_factors.png")
            page.screenshot(path=shap_shot)
            print(f"Captured: {shap_shot}")

        # 5. Capture "Personalized Checklist / Plan"
        plan_tab = page.locator("button:has-text('Personalized Checklist'), button:has-text('Plan'), [data-tab='checklist']").first
        if plan_tab.count() > 0:
            plan_tab.click()
            time.sleep(1.5)
            plan_shot = os.path.join(ARTIFACTS_DIR, "ui_4_personalized_plan.png")
            page.screenshot(path=plan_shot)
            print(f"Captured: {plan_shot}")

        # 6. Capture "AI Health Chatbot"
        chat_tab = page.locator("button:has-text('AI Health Chatbot'), button:has-text('Chatbot'), [data-tab='chat']").first
        if chat_tab.count() > 0:
            chat_tab.click()
            time.sleep(1)
            # Ask a question
            chat_input = page.locator("input[placeholder*='Ask follow-up'], input[placeholder*='question']")
            if chat_input.count() > 0:
                chat_input.fill("What dietary changes can help lower my heart disease risk?")
                page.keyboard.press("Enter")
                # Wait for response
                time.sleep(6)
            chat_shot = os.path.join(ARTIFACTS_DIR, "ui_5_ai_chatbot.png")
            page.screenshot(path=chat_shot)
            print(f"Captured: {chat_shot}")

        # 7. Add 2nd assessment with improved numbers to show Trend Chart
        if token:
            h_payload_2 = {
                "age": 65, "Age": 65, "sex": 1, "Sex": 1, "cp": 1, "trestbps": 130, "chol": 210, "fbs": 0, "exang": 0,
                "BMI": 29, "HighBP": 0, "HighChol": 0, "Smoker": 0, "PhysActivity": 1,
                "Fruits": 1, "Veggies": 1, "HvyAlcoholConsump": 0, "Stroke": 0,
                "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 2, "MentHlth": 0, "PhysHlth": 0
            }
            httpx.post("http://127.0.0.1:8000/predict", headers={"Authorization": f"Bearer {token}"}, json=h_payload_2, timeout=15)
            page.reload(wait_until="networkidle")
            time.sleep(2)

        # 8. Capture "Risk Trajectory Trend" tab
        trend_tab = page.locator("button:has-text('Risk Trajectory Trend'), button:has-text('Trajectory'), [data-tab='trend']").first
        if trend_tab.count() > 0:
            trend_tab.click()
            time.sleep(2)
            trend_shot = os.path.join(ARTIFACTS_DIR, "ui_6_trend_chart.png")
            page.screenshot(path=trend_shot)
            print(f"Captured: {trend_shot}")

        # 9. Capture "Hospital Finder"
        hosp_tab = page.locator("button:has-text('Nearby'), button:has-text('Hospital'), [data-tab='hospitals']").first
        if hosp_tab.count() > 0:
            hosp_tab.click()
            time.sleep(2)
            hosp_shot = os.path.join(ARTIFACTS_DIR, "ui_7_nearby_hospitals.png")
            page.screenshot(path=hosp_shot)
            print(f"Captured: {hosp_shot}")

        context.close()

        # 10. Mobile Viewport (375x812 - iPhone X/12/13/14)
        print("Testing Mobile Viewport (375x812)...")
        mobile_context = browser.new_context(
            viewport={"width": 375, "height": 812},
            is_mobile=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )
        mobile_page = mobile_context.new_page()
        # Set token in localStorage
        mobile_page.goto("http://localhost:5173/login", wait_until="networkidle")
        if token:
            mobile_page.evaluate(f"token => localStorage.setItem('token', token)", token)
            mobile_page.goto("http://localhost:5173/dashboard", wait_until="networkidle")
            time.sleep(3)
        mobile_shot = os.path.join(ARTIFACTS_DIR, "ui_8_mobile_viewport.png")
        mobile_page.screenshot(path=mobile_shot, full_page=True)
        print(f"Captured: {mobile_shot}")
        mobile_context.close()

        browser.close()

    print("\n--- Browser Console Errors Report ---")
    # Filter out harmless vite HMR or minor favicon warnings
    critical_errors = [e for e in console_errors if not any(x in e.lower() for x in ["favicon", "hmr", "download the react devtools"])]
    if critical_errors:
        print(f"WARNING: Found {len(critical_errors)} console errors:")
        for err in critical_errors:
            print(" -", err)
    else:
        print("PASS: Browser console showed zero runtime errors!")

    return len(critical_errors) == 0

if __name__ == "__main__":
    success = run_ui_suite()
    print(f"\nUI Suite Completed. Success: {success}")
