resource "aws_sns_topic" "ci_cd_alerts" {
  name = "ci-cd-alerts"
}

resource "aws_sns_topic_subscription" "ci_cd_email" {
  topic_arn = aws_sns_topic.ci_cd_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CloudWatch Logs metric filter: count ERROR lines in README_LOGS stream.
# This requires GitHub Actions to push its build logs to CloudWatch Logs
# (e.g. via `aws logs put-log-events` in a workflow step on failure).
# Until log forwarding is wired, this alarm stays in OK state by design.
resource "aws_cloudwatch_log_group" "ci_cd_logs" {
  name              = "/flyby/ci-cd"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_metric_filter" "pipeline_errors" {
  name           = "ci-cd-pipeline-errors"
  log_group_name = aws_cloudwatch_log_group.ci_cd_logs.name
  pattern        = "ERROR"
  metric_transformation {
    name          = "CICDPipelineErrors"
    namespace     = "Flyby/CICD"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "pipeline_failure" {
  alarm_name          = "ci-cd-pipeline-failure"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CICDPipelineErrors"
  namespace           = "Flyby/CICD"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Alert when CI/CD pipeline logs contain ERROR entries"
  actions_enabled     = true
  alarm_actions       = [aws_sns_topic.ci_cd_alerts.arn]
}
