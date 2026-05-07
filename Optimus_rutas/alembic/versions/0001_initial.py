"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "routes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "in_progress", "completed", "cancelled",
                name="route_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("start_address", sa.Text(), nullable=False),
        sa.Column("start_lat", sa.Float(), nullable=False),
        sa.Column("start_lng", sa.Float(), nullable=False),
        sa.Column("return_to_start", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("average_speed_kmh", sa.Float(), nullable=False, server_default="30"),
        sa.Column("total_distance_km", sa.Float(), nullable=False, server_default="0"),
        sa.Column("estimated_time_minutes", sa.Float(), nullable=False, server_default="0"),
        sa.Column("current_stop_index", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_routes_user_id", "routes", ["user_id"])
    op.create_index("ix_routes_status", "routes", ["status"])
    op.create_index("ix_routes_created_at", "routes", ["created_at"])
    op.create_index("ix_routes_status_created", "routes", ["status", "created_at"])

    op.create_table(
        "route_stops",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("route_id", sa.String(length=36), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=True),
        sa.Column(
            "distance_from_previous_km", sa.Float(), nullable=False, server_default="0"
        ),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "visited", "skipped", "failed",
                name="stop_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("visited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["route_id"], ["routes.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_route_stops_route_id", "route_stops", ["route_id"])

    op.create_table(
        "geocoding_cache",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("address_normalized", sa.String(length=500), nullable=False, unique=True),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("mapbox_response_raw", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_geocoding_cache_address_normalized",
        "geocoding_cache",
        ["address_normalized"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_geocoding_cache_address_normalized", table_name="geocoding_cache")
    op.drop_table("geocoding_cache")
    op.drop_index("ix_route_stops_route_id", table_name="route_stops")
    op.drop_table("route_stops")
    op.drop_index("ix_routes_status_created", table_name="routes")
    op.drop_index("ix_routes_created_at", table_name="routes")
    op.drop_index("ix_routes_status", table_name="routes")
    op.drop_index("ix_routes_user_id", table_name="routes")
    op.drop_table("routes")
