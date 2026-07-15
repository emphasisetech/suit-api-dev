#!/bin/bash

BASE_URL="http://localhost:6000/api/v1"

echo "Testing Student Creation Validation (Missing name)..."
curl -s -X POST "$BASE_URL/student" \
     -H "Content-Type: application/json" \
     -d '{"client": "TestClient"}' | grep -i "name is required" && echo "✅ Success: Error caught" || echo "❌ Failure: Error not caught"

echo -e "\nTesting Add Payment Validation (Missing payment_amount)..."
curl -s -X POST "$BASE_URL/student/payments" \
     -H "Content-Type: application/json" \
     -d '{"student_id": "123", "course_id": "456", "payment_mode": "Cash"}' | grep -i "payment_amount is required" && echo "✅ Success: Error caught" || echo "❌ Failure: Error not caught"

echo -e "\nTesting Create Course Validation (Missing course_name)..."
curl -s -X POST "$BASE_URL/student/courses" \
     -H "Content-Type: application/json" \
     -d '{"student_id": "123", "course_fee": 1000}' | grep -i "course_name is required" && echo "✅ Success: Error caught" || echo "❌ Failure: Error not caught"

echo -e "\nTesting Course Master Validation (Missing courses)..."
curl -s -X POST "$BASE_URL/course-master" \
     -H "Content-Type: application/json" \
     -d '{"client": "TestClient"}' | grep -i "courses is required" && echo "✅ Success: Error caught" || echo "❌ Failure: Error not caught"
