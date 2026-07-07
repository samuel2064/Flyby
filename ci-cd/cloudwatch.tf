resource "aws_sns_topic" "ci_cd_alerts" {
  name = "ci-cd-alerts"
}

resource "aws_sns_topic_subscription" "ci_cd_email" {
  topic_arn = aws_sns_topic.ci_cd_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "pipeline_failure" {
  alarm_name          = "ci-cd-pipeline-failure"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/CodeBuild"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when CI/CD pipeline build fails"
   actions_enabled     = true
   alarm_actions       = [aws_sns_topic.ci_cd_alerts.arn]
  // Use the same IAM role for notifications or integrate SNS as needed
}
